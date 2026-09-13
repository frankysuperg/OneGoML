"""
OneGoML API Server — FastAPI
=============================
Endpoints (all match decision_response_schema.json / event_log_schema.json):

  POST /decide
      Body: order_offered fields + optional courier_state_overrides
      Response: decide_response (order_id, decision, reason, binding_constraint,
                latency_ms, tier, degraded, economics?)

  GET  /explain_decision?order_id=<id>
      Response: explain_decision_response from in-memory log

  GET  /events?seed=<n>&n_offers=<n>&vehicle=<v>
      Server-Sent Events stream — emits SimulatorEvents one by one.
      Frontend EventSource connects here.

  POST /shock
      Body: { shock_type: "surge"|"closure"|"rain"|"delay", zone?: int, ... }
      Injects a shock event into the running simulation stream.

  GET  /status
      Response: { degraded: bool, sim_time: str, events_emitted: int,
                  active_shocks: [...], model_connection: str }

  POST /model_failure
      Body: { failed: bool }
      Toggle degraded mode for live demos (Req 5 — judges cut the model).

Run with:
  cd <repo_root>
  venv314\\Scripts\\python.exe -m uvicorn src.api.server:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# ── Path setup ──────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent  # src/
sys.path.insert(0, str(ROOT))

from onego.courier.decide import CourierDecider
from onego.data.generador_delivery_mty import EventGenerator

# ── Application ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="OneGoML Courier Agent API",
    description="Fast-path decision engine + live event stream for HackMTY 2026.",
    version="0.1.0",
)

# Allow the Vite dev server (port 5173) to call this API without CORS errors.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Shared state ─────────────────────────────────────────────────────────────
# One decider instance shared across requests (stateless per-call via overrides).
_decider = CourierDecider()

# In-memory event log: order_id → full explain_decision_response payload.
# Populated as /decide is called.
_explain_log: dict[str, dict[str, Any]] = {}

# Simulation state (updated by /events stream and /shock)
_sim_state: dict[str, Any] = {
    "sim_time": "",
    "events_emitted": 0,
    "active_shocks": [],
    "model_connection": "online",
}

# Pending shocks to inject into the next stream (populated by POST /shock)
_pending_shocks: list[dict] = []


# ── POST /decide ─────────────────────────────────────────────────────────────
@app.post("/decide")
async def decide(body: dict[str, Any]) -> dict[str, Any]:
    """
    Fast-path decision endpoint.
    Body must match order_offered fields from event_log_schema.json.
    Response matches decision_response_schema.json decide_response.
    Latency budget: ≤ 50 ms (enforced by CourierDecider internally).
    """
    result = _decider.decide(body)

    # Record in explain log for /explain_decision lookups
    order_id = result.get("order_id", body.get("order_id", "UNKNOWN"))
    _explain_log[order_id] = {
        "order_id": order_id,
        "decision": result["decision"],
        "reason": result["reason"],
        "inputs": {
            "position_zone": body.get("zone_pickup"),
            "sim_time": body.get("sim_time"),
            "distance_delivery_km": body.get("distance_delivery_km"),
            "base_pay_mxn": body.get("base_pay_mxn"),
            "surge_multiplier": body.get("surge_multiplier"),
            "vehicle": body.get("vehicle"),
            "courier_state": body.get("courier_state_overrides", {}),
            "economics": result.get("economics"),
        },
        "alternatives_considered": _build_alternatives(result),
    }

    # Keep global sim_time updated
    if "sim_time" in body:
        _sim_state["sim_time"] = body["sim_time"]

    return result


# ── GET /explain_decision ────────────────────────────────────────────────────
@app.get("/explain_decision")
async def explain_decision(order_id: str = Query(...)) -> dict[str, Any]:
    """
    Returns the stored explanation for a past decision.
    Reads from in-memory log — never re-runs the system (Req 6.1).
    Response time < 10 s guaranteed (it's a dict lookup).
    """
    if order_id not in _explain_log:
        raise HTTPException(
            status_code=404,
            detail=f"No decision log found for order_id='{order_id}'. "
                   "Call POST /decide first to generate and store a decision.",
        )
    return _explain_log[order_id]


# ── GET /events (SSE stream) ─────────────────────────────────────────────────
@app.get("/events")
async def events_stream(
    seed: int = Query(default=1, description="RNG seed for deterministic stream"),
    n_offers: int = Query(default=30, ge=1, le=200),
    vehicle: str = Query(default="moto"),
    speed: float = Query(default=1.0, ge=0.1, le=10.0,
                         description="Playback speed multiplier (1=real-time mock)"),
) -> StreamingResponse:
    """
    Server-Sent Events stream of SimulatorEvents.

    The frontend EventSource connects here. Each event is a JSON-encoded
    SimulatorEvent (matches event_log_schema.json).

    Query params:
      seed      — deterministic RNG seed
      n_offers  — number of order/shock events to emit
      vehicle   — active vehicle type
      speed     — playback speed (higher = faster interval)
    """
    gen = EventGenerator(seed=seed, n_offers=n_offers, vehicle=vehicle)
    interval_s = max(0.05, 0.8 / speed)  # base ~800ms per event at 1×

    async def generate() -> AsyncGenerator[str, None]:
        _sim_state["events_emitted"] = 0
        _sim_state["active_shocks"] = []

        for event in gen.stream():
            # Inject any pending shocks before the next order event
            while _pending_shocks:
                shock = _pending_shocks.pop(0)
                _sim_state["active_shocks"].append(shock)
                _sim_state["sim_time"] = shock.get("sim_time", _sim_state["sim_time"])
                _sim_state["events_emitted"] += 1
                yield _sse(shock)
                await asyncio.sleep(0.05)

            # Emit the scheduled event
            _sim_state["sim_time"] = event.get("sim_time", "")
            _sim_state["events_emitted"] += 1

            # Track active shocks from the stream itself
            if event.get("event") == "shock":
                _sim_state["active_shocks"].append(event)

            yield _sse(event)
            await asyncio.sleep(interval_s)

        # Signal end-of-stream
        yield _sse({"event": "stream_end", "sim_time": _sim_state["sim_time"]})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",       # disable nginx buffering
            "Access-Control-Allow-Origin": "*",
        },
    )


# ── POST /shock ──────────────────────────────────────────────────────────────
@app.post("/shock")
async def inject_shock(body: dict[str, Any]) -> dict[str, Any]:
    """
    Inject a shock event into the running simulation stream.
    The shock appears on the next SSE tick, without interrupting the stream.

    Body fields (match ShockEvent in event_log_schema.json):
      shock_type: "surge" | "closure" | "rain" | "delay"
      zone:       int (optional)
      multiplier: float (for surge)
      road:       str (for closure)
      duration_min: int
    """
    shock_type = body.get("shock_type")
    valid_types = {"surge", "closure", "rain", "delay"}
    if shock_type not in valid_types:
        raise HTTPException(
            status_code=422,
            detail=f"shock_type must be one of {valid_types}, got '{shock_type}'",
        )

    shock_event: dict[str, Any] = {
        "event": "shock",
        "event_type": "shock",
        "sim_time": _sim_state.get("sim_time", ""),
        "shock_type": shock_type,
    }
    if "zone" in body:
        shock_event["zone"] = body["zone"]
    if shock_type == "surge":
        shock_event["multiplier"] = body.get("multiplier", 1.6)
        shock_event["duration_min"] = body.get("duration_min", 25)
    elif shock_type == "closure":
        shock_event["road"] = body.get("road", "Av. Constitución")
        shock_event["duration_min"] = body.get("duration_min", 30)
    elif shock_type == "rain":
        shock_event["duration_min"] = body.get("duration_min", 40)
    elif shock_type == "delay":
        shock_event["order_id"] = body.get("order_id")
        shock_event["slip_min"] = body.get("slip_min", 12)

    _pending_shocks.append(shock_event)

    return {
        "queued": True,
        "shock_type": shock_type,
        "sim_time": shock_event["sim_time"],
    }


# ── GET /status ──────────────────────────────────────────────────────────────
@app.get("/status")
async def status() -> dict[str, Any]:
    """
    Current simulation and model status.
    Used by the frontend TopBar to show model_connection and active_shocks.
    """
    return {
        "degraded": _decider._model.is_degraded,
        "model_connection": "degraded" if _decider._model.is_degraded else "online",
        "sim_time": _sim_state["sim_time"],
        "events_emitted": _sim_state["events_emitted"],
        "active_shocks": _sim_state["active_shocks"],
        "reservation_wage_mxn_hr": _decider._reservation_wage,
    }


# ── POST /model_failure ───────────────────────────────────────────────────────
@app.post("/model_failure")
async def model_failure(body: dict[str, Any]) -> dict[str, Any]:
    """
    Toggle degraded mode for live judge demos (Req 5).
    Body: { "failed": true|false }

    When failed=true: CourierDecider uses heuristic fallback, degraded=true
    in all /decide responses.
    When failed=false: model recovers, degraded=false.
    """
    failed: bool = bool(body.get("failed", False))
    _decider.force_model_failure(failed)
    return {
        "degraded": failed,
        "model_connection": "degraded" if failed else "online",
        "message": (
            "Model forced to degraded mode — fast path using heuristic fallback."
            if failed
            else "Model restored — fast path using ML predictions."
        ),
    }


# ── GET /explain_decision/all (convenience for debugging) ────────────────────
@app.get("/explain_decision/all")
async def explain_all() -> dict[str, Any]:
    """Return all stored decision explanations (for debugging / replay)."""
    return {"count": len(_explain_log), "decisions": _explain_log}


# ── Helpers ──────────────────────────────────────────────────────────────────
def _sse(payload: dict[str, Any]) -> str:
    """Format a dict as a Server-Sent Events data line."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _build_alternatives(result: dict[str, Any]) -> list[dict[str, str]]:
    """Build alternatives_considered for explain_decision from decide result."""
    decision = result["decision"]
    bc = result.get("binding_constraint")

    if bc and bc != "reservation_wage":
        # Safety constraint fired — alternative would have been to ignore it
        return [
            {
                "option": "ACCEPT ignoring safety constraint",
                "rejected_because": (
                    f"Safety gate '{bc}' is a hard rule; "
                    "cannot be overridden by pay criteria (safety-over-pay invariance)."
                ),
            }
        ]
    if bc == "reservation_wage":
        econ = result.get("economics") or {}
        rate = econ.get("adjusted_rate_mxn_hr", "?")
        wage = econ.get("reservation_wage_mxn_hr", "?")
        return [
            {
                "option": "ACCEPT at current rate",
                "rejected_because": (
                    f"Adjusted rate {rate} MXN/hr is below reservation wage "
                    f"{wage} MXN/hr; accepting would reduce hourly earnings."
                ),
            }
        ]
    if decision == "ACCEPT":
        return [
            {
                "option": "SKIP this order",
                "rejected_because": (
                    "Rate cleared reservation wage and all safety gates passed; "
                    "skipping would leave earnings on the table."
                ),
            }
        ]
    return []


# ── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.api.server:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=["src"],
    )
