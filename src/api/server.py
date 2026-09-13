"""
OneGoML API Server — FastAPI
=============================
Standardized endpoints complying with decision_response_schema.json and event_log_schema.json:

  POST /decide
      Body: order_offered fields + optional courier_state_overrides
      Response: decide_response (order_id, decision, reason, binding_constraint,
                latency_ms, tier, degraded, economics)

  GET  /explain_decision?order_id=<id>
      Response: explain_decision_response from in-memory log

  GET  /events?seed=<n>&n_offers=<n>&vehicle=<v>&speed=<s>
      Server-Sent Events stream — emits complete SimulatorEvents sequence:
      shift_start, order_offered, decision, position_update, earnings_update,
      shock, strategy_update, shift_end.

  POST /shock
      Body: { shock_type: "surge"|"closure"|"rain"|"delay", zone?: int, ... }
      Injects a shock event into the running simulation stream.

  GET  /status
      Response: { degraded: bool, model_connection: str, sim_time: str,
                  events_emitted: int, active_shocks: [...],
                  reservation_wage_mxn_hr: float, vehicle: str }

  POST /model_failure
      Body: { failed: bool }
      Toggle degraded mode for live demos (Req 5 — judges cut the model).

  GET  /replay/log?seed=<n>&n_offers=<n>&vehicle=<v>
      Returns a deterministic, full-shift event log array for Replay mode.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
# ── Path setup ──────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent  # src/
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT.parent / ".env")
except ImportError:
    pass

from onego.courier.decide import CourierDecider
from onego.data.generador_delivery_mty import EventGenerator
from onego.ai.explainer import AIDecisionExplainer

# ── Application ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="OneGoML Courier Agent API",
    description="Fast-path decision engine + live event stream for HackMTY 2026.",
    version="1.0.0",
)

# Allow the Vite dev server (port 5173) to call this API without CORS errors.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Shared state ─────────────────────────────────────────────────────────────
_decider = CourierDecider()
_ai_explainer = AIDecisionExplainer()

# In-memory event log: order_id -> full explain_decision_response payload.
_explain_log: dict[str, dict[str, Any]] = {}

# Simulation state
_sim_state: dict[str, Any] = {
    "sim_time": "2026-03-21T15:00:00",
    "events_emitted": 0,
    "active_shocks": [],
    "model_connection": "online",
    "vehicle": "moto",
}

# Pending shocks to inject into the live stream
_pending_shocks: list[dict[str, Any]] = []

# Exact recorded events from the most recent live simulation run for identical replay
_last_stream_events: list[dict[str, Any]] = []


# ── POST /decide ─────────────────────────────────────────────────────────────
@app.post("/decide")
async def decide(body: dict[str, Any]) -> dict[str, Any]:
    """
    Fast-path decision endpoint.
    Body must match order_offered fields from event_log_schema.json.
    Response matches decision_response_schema.json decide_response.
    Latency budget: <= 50 ms (enforced by CourierDecider internally).
    """
    result = _decider.decide(body)

    order_id = result.get("order_id", body.get("order_id", "UNKNOWN"))
    _explain_log[order_id] = {
        "order_id": order_id,
        "decision": result["decision"],
        "reason": result["reason"],
        "binding_constraint": result.get("binding_constraint"),
        "inputs": {
            "position_zone": body.get("zone_pickup"),
            "zone_dropoff": body.get("zone_dropoff"),
            "sim_time": body.get("sim_time"),
            "distance_pickup_km": body.get("distance_pickup_km", 0.0),
            "distance_delivery_km": body.get("distance_delivery_km", body.get("distance_km", 0.0)),
            "base_pay_mxn": body.get("base_pay_mxn", body.get("base_pay", 0.0)),
            "est_tip_mxn": body.get("est_tip_mxn", body.get("tip", 0.0)),
            "surge_multiplier": body.get("surge_multiplier", 1.0),
            "weight_kg": body.get("weight_kg", 0.0),
            "volume_liters": body.get("volume_liters", 0.0),
            "vehicle": body.get("vehicle", _decider._vehicle),
            "courier_state": body.get("courier_state_overrides", {}),
            "economics": result.get("economics"),
        },
        "alternatives_considered": _build_alternatives(result),
    }

    if "sim_time" in body:
        _sim_state["sim_time"] = body["sim_time"]

    return result


# ── GET /explain_decision ────────────────────────────────────────────────────
@app.get("/explain_decision")
async def explain_decision(order_id: str = Query(...)) -> dict[str, Any]:
    """
    Returns the stored explanation for a past decision.
    Reads from in-memory log — never re-runs the system (Req 6.1).
    Response time < 10 s guaranteed.
    Enriched with deep AI interpretation and metric breakdown.
    """
    if order_id not in _explain_log:
        raise HTTPException(
            status_code=404,
            detail=f"No decision log found for order_id='{order_id}'. "
                   "Call POST /decide first or run the simulation stream.",
        )
    stored = _explain_log[order_id]
    if "ai_explanation" not in stored:
        stored["ai_explanation"] = _ai_explainer.explain(
            order_id=order_id,
            decision=stored["decision"],
            reason=stored["reason"],
            inputs=stored.get("inputs", {}),
            binding_constraint=stored.get("binding_constraint"),
        )
    return stored


# ── POST /explain_ai ─────────────────────────────────────────────────────────
class ExplainAIRequest(BaseModel):
    order_id: str
    api_key: str | None = None
    force_local: bool = False


@app.post("/explain_ai")
async def explain_ai(req: ExplainAIRequest) -> dict[str, Any]:
    """
    On-demand AI breakdown and natural-language interpretation of an order decision.
    Uses Google Gemini if API key is provided, or the built-in Local AI Explainer engine.
    """
    if req.order_id not in _explain_log:
        raise HTTPException(
            status_code=404,
            detail=f"No decision log found for order_id='{req.order_id}'. "
                   "Call POST /decide first or run the simulation stream.",
        )
    stored = _explain_log[req.order_id]
    explainer = AIDecisionExplainer(api_key=req.api_key) if req.api_key else _ai_explainer
    ai_res = explainer.explain(
        order_id=req.order_id,
        decision=stored["decision"],
        reason=stored["reason"],
        inputs=stored.get("inputs", {}),
        binding_constraint=stored.get("binding_constraint"),
        force_local=req.force_local,
    )
    stored["ai_explanation"] = ai_res
    return ai_res


# ── GET/POST /config/gemini_key ──────────────────────────────────────────────
class GeminiKeyConfig(BaseModel):
    api_key: str


@app.get("/config/gemini_key")
async def get_gemini_key() -> dict[str, Any]:
    """Check if Gemini API key is configured."""
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    return {
        "configured": bool(key),
        "masked_key": f"{key[:4]}...{key[-4:]}" if key and len(key) > 8 else ("configured" if key else None),
    }


@app.post("/config/gemini_key")
async def set_gemini_key(req: GeminiKeyConfig) -> dict[str, Any]:
    """Dynamically set Gemini API key and persist to .env."""
    global _ai_explainer
    clean_key = req.api_key.strip()
    os.environ["GEMINI_API_KEY"] = clean_key
    _ai_explainer = AIDecisionExplainer(api_key=clean_key)

    env_path = ROOT.parent / ".env"
    try:
        lines = []
        if env_path.exists():
            lines = [l for l in env_path.read_text(encoding="utf-8").splitlines() if not l.startswith("GEMINI_API_KEY=")]
        lines.append(f"GEMINI_API_KEY={clean_key}")
        env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except Exception:
        pass

    return {
        "status": "ok",
        "configured": bool(clean_key),
        "masked_key": f"{clean_key[:4]}...{clean_key[-4:]}" if len(clean_key) > 8 else "configured",
    }


# ── Helper for Baseline (GreedyRate) Decisions ────────────────────────────────
def _decide_baseline(order: dict[str, Any], vehicle: str = "moto") -> dict[str, Any]:
    """
    Greedy baseline: accepts based on nominal gross pay/time,
    frequently neglecting safety checks and deadhead penalties.
    """
    base_pay = float(order.get("base_pay_mxn", order.get("base_pay", 40.0)))
    tip = float(order.get("est_tip_mxn", order.get("tip", 0.0)))
    surge = float(order.get("surge_multiplier", 1.0))
    dist_del = float(order.get("distance_delivery_km", order.get("distance_km", 3.0)))
    dist_pick = float(order.get("distance_pickup_km", 0.0))
    weight = float(order.get("weight_kg", 0.0))
    hour = int(order.get("hour_of_day", 15))
    zone_drop = int(order.get("zone_dropoff", 0))

    gross_pay = base_pay * surge + tip
    gross_rate = (gross_pay / max(dist_del * 3.2, 1.0)) * 60.0

    fuel_per_km = {"bike": 0.0, "moto": 4.5, "car": 8.0}.get(vehicle, 4.5)
    real_net_pay = gross_pay - (dist_del + dist_pick) * fuel_per_km

    cap_limit = {"bike": 10.0, "moto": 15.0, "car": 50.0}.get(vehicle, 15.0)
    is_cap_violation = weight > cap_limit
    is_night_violation = hour >= 22 and (zone_drop in {2, 5, 11, 13} or order.get("zone_risk", 0) >= 1)
    has_safety_violation = is_cap_violation or is_night_violation

    # Baseline accepts greedily whenever nominal pay is attractive
    # It accepts sub-optimal orders that OurAgent filters out!
    if gross_pay >= 52.0 or gross_rate >= 115.0:
        reason = "Nominal rate looks high; accepted without checking deadhead or safety."
        if has_safety_violation:
            reason = "Accepted greedily despite violating vehicle safety limits."
        return {
            "decision": "ACCEPT",
            "reason": reason,
            "safety_violation": has_safety_violation,
            "net_pay": max(0.0, real_net_pay),
        }
    return {
        "decision": "SKIP",
        "reason": "Gross rate below naive baseline threshold.",
        "safety_violation": False,
        "net_pay": 0.0,
    }


# ── GET /events (SSE stream) ─────────────────────────────────────────────────
@app.get("/events")
async def events_stream(
    seed: int = Query(default=1, description="RNG seed for deterministic stream"),
    n_offers: int = Query(default=30, ge=1, le=200),
    vehicle: str = Query(default="moto"),
    speed: float = Query(default=1.0, ge=0.1, le=10.0, description="Playback speed multiplier"),
) -> StreamingResponse:
    """
    Server-Sent Events stream of SimulatorEvents.
    Emits the complete lifecycle of simulator events:
      shift_start -> order_offered -> decision -> position_update -> earnings_update -> shock -> shift_end
    """
    _decider.set_vehicle(vehicle)
    _sim_state["vehicle"] = vehicle
    gen = EventGenerator(seed=seed, n_offers=n_offers, vehicle=vehicle)

    # Dynamic delay pacing relative to playback speed
    delay_offer = max(0.15, 0.75 / speed)
    delay_decide = max(0.15, 0.75 / speed)
    delay_step = max(0.1, 0.35 / speed)
    delay_between = max(0.2, 0.9 / speed)

    async def generate() -> AsyncGenerator[str, None]:
        _sim_state["events_emitted"] = 0
        _sim_state["active_shocks"] = []
        _last_stream_events.clear()

        def emit(ev: dict[str, Any]) -> str:
            _last_stream_events.append(dict(ev))
            return _sse(ev)

        our_earnings = 0.0
        our_completed = 0
        our_accepted = 0
        our_rejected = 0
        our_violations = 0
        current_zone = 7

        base_earnings = 0.0
        base_completed = 0
        base_accepted = 0
        base_rejected = 0
        base_violations = 0

        raw_stream = list(gen.stream())

        for raw_event in raw_stream:
            # 1. Process any pending live shocks injected via POST /shock
            while _pending_shocks:
                shock = _pending_shocks.pop(0)
                _sim_state["active_shocks"].append(shock)
                _sim_state["sim_time"] = shock.get("sim_time", _sim_state["sim_time"])
                _sim_state["events_emitted"] += 1
                yield emit(shock)
                await asyncio.sleep(0.08)

                # Strategy update reacting to the shock
                new_wage = _decider._reservation_wage * (1.15 if shock.get("shock_type") == "surge" else 0.95)
                _decider.set_reservation_wage(round(new_wage, 1))
                strat_ev = {
                    "event": "strategy_update",
                    "sim_time": shock.get("sim_time", _sim_state["sim_time"]),
                    "reservation_wage_mxn_hr": round(new_wage, 1),
                    "target_zone": shock.get("zone", current_zone),
                    "reasoning": f"Adjusted reservation wage due to active {shock.get('shock_type')} shock.",
                    "confidence": "high",
                    "degraded": _decider._model.is_degraded,
                }
                yield emit(strat_ev)
                await asyncio.sleep(0.08)

            # 2. Process generator events
            ev_type = raw_event.get("event")
            sim_time = raw_event.get("sim_time", _sim_state["sim_time"])
            _sim_state["sim_time"] = sim_time
            _sim_state["events_emitted"] += 1

            if ev_type == "shift_start":
                current_zone = raw_event.get("start_location_zone", 7)
                yield emit(raw_event)
                await asyncio.sleep(delay_between)
                continue

            elif ev_type == "shock":
                _sim_state["active_shocks"].append(raw_event)
                yield emit(raw_event)
                await asyncio.sleep(0.1)

                strat_ev = {
                    "event": "strategy_update",
                    "sim_time": sim_time,
                    "reservation_wage_mxn_hr": _decider._reservation_wage,
                    "target_zone": raw_event.get("zone", current_zone),
                    "reasoning": f"Holding strategy; monitoring {raw_event.get('shock_type')} shock.",
                    "confidence": "high",
                    "degraded": _decider._model.is_degraded,
                }
                yield emit(strat_ev)
                await asyncio.sleep(delay_between)
                continue

            elif ev_type == "order_offered":
                # Step 1: Offer the order to both agents
                yield emit(raw_event)
                await asyncio.sleep(delay_offer)

                # Step 2: Evaluate OurAgent decision
                dec_res = _decider.decide(raw_event)
                order_id = raw_event["order_id"]

                # Cache in _explain_log
                _explain_log[order_id] = {
                    "order_id": order_id,
                    "decision": dec_res["decision"],
                    "reason": dec_res["reason"],
                    "binding_constraint": dec_res.get("binding_constraint"),
                    "inputs": {
                        "position_zone": raw_event.get("zone_pickup"),
                        "zone_dropoff": raw_event.get("zone_dropoff"),
                        "sim_time": sim_time,
                        "distance_pickup_km": raw_event.get("distance_pickup_km", 0.0),
                        "distance_delivery_km": raw_event.get("distance_delivery_km", 0.0),
                        "base_pay_mxn": raw_event.get("base_pay_mxn", 0.0),
                        "surge_multiplier": raw_event.get("surge_multiplier", 1.0),
                        "weight_kg": raw_event.get("weight_kg", 0.0),
                        "volume_liters": raw_event.get("volume_liters", 0.0),
                        "vehicle": raw_event.get("vehicle", vehicle),
                        "courier_state": raw_event.get("courier_state_overrides", {}),
                        "economics": dec_res.get("economics"),
                    },
                    "alternatives_considered": _build_alternatives(dec_res),
                }

                # Step 3: Evaluate Baseline (GreedyRate)
                base_dec = _decide_baseline(raw_event, vehicle=vehicle)
                if base_dec["decision"] == "ACCEPT":
                    base_accepted += 1
                    base_completed += 1
                    base_earnings += max(0.0, base_dec["net_pay"])
                    if base_dec["safety_violation"]:
                        base_violations += 1
                else:
                    base_rejected += 1

                # Emit decision event for OurAgent + Baseline comparison
                dec_event = {
                    "event": "decision",
                    "order_id": order_id,
                    "sim_time": sim_time,
                    "decision": dec_res["decision"],
                    "reason": dec_res["reason"],
                    "latency_ms": dec_res["latency_ms"],
                    "binding_constraint": dec_res.get("binding_constraint"),
                    "tier": dec_res.get("tier", "tier1"),
                    "degraded": dec_res.get("degraded", False),
                    "economics": dec_res.get("economics"),
                    # Augmented comparison block for dual-agent UI
                    "baseline": {
                        "name": "GreedyRate",
                        "decision": base_dec["decision"],
                        "reason": base_dec["reason"],
                        "safety_violations": base_violations,
                        "earnings_mxn": round(base_earnings, 2),
                        "orders_completed": base_completed,
                        "orders_accepted": base_accepted,
                        "orders_rejected": base_rejected,
                    },
                }
                yield emit(dec_event)
                await asyncio.sleep(delay_decide)

                if dec_res["decision"] == "ACCEPT":
                    our_accepted += 1
                    our_completed += 1
                    econ = dec_res.get("economics") or {}
                    net_pay = float(econ.get("net_pay_mxn", raw_event.get("base_pay_mxn", 40.0)))
                    our_earnings += max(0.0, net_pay)

                    # Transit: to pickup
                    current_zone = raw_event["zone_pickup"]
                    pos_ev1 = {
                        "event": "position_update",
                        "sim_time": sim_time,
                        "zone": current_zone,
                        "status": "to_pickup",
                    }
                    yield emit(pos_ev1)
                    await asyncio.sleep(delay_step)

                    # Delivery: to dropoff
                    current_zone = raw_event["zone_dropoff"]
                    pos_ev2 = {
                        "event": "position_update",
                        "sim_time": sim_time,
                        "zone": current_zone,
                        "status": "to_dropoff",
                    }
                    yield emit(pos_ev2)
                    await asyncio.sleep(delay_step)

                    # Earnings update
                    rate = (our_earnings / max(our_completed * 0.35, 0.5)) * 1.0
                    earn_ev = {
                        "event": "earnings_update",
                        "sim_time": sim_time,
                        "earnings_mxn": round(our_earnings, 2),
                        "orders_completed": our_completed,
                        "mxn_per_hr": round(rate, 2),
                    }
                    yield emit(earn_ev)
                    await asyncio.sleep(delay_step)
                else:
                    our_rejected += 1
                    pos_ev = {
                        "event": "position_update",
                        "sim_time": sim_time,
                        "zone": current_zone,
                        "status": "idle",
                    }
                    yield emit(pos_ev)

                await asyncio.sleep(delay_between)

            elif ev_type == "shift_end":
                shift_end_ev = {
                    "event": "shift_end",
                    "sim_time": sim_time,
                    "orders_offered": our_accepted + our_rejected,
                    "orders_completed": our_completed,
                    "earnings_mxn": round(our_earnings, 2),
                    "safety_violations": our_violations,
                }
                yield emit(shift_end_ev)
                await asyncio.sleep(0.1)

        # End of stream marker
        yield emit({"event": "stream_end", "sim_time": _sim_state["sim_time"]})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


# ── POST /shock ──────────────────────────────────────────────────────────────
@app.post("/shock")
async def inject_shock(body: dict[str, Any]) -> dict[str, Any]:
    """
    Inject a shock event into the running simulation stream.
    The shock appears on the next SSE tick without interrupting the stream.
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
        "sim_time": _sim_state.get("sim_time", "2026-03-21T18:00:00"),
        "shock_type": shock_type,
    }
    if "zone" in body:
        shock_event["zone"] = int(body["zone"])
    else:
        shock_event["zone"] = 11

    if shock_type == "surge":
        shock_event["multiplier"] = float(body.get("multiplier", 1.6))
        shock_event["duration_min"] = int(body.get("duration_min", 25))
    elif shock_type == "closure":
        shock_event["road"] = str(body.get("road", "Av. Constitución"))
        shock_event["duration_min"] = int(body.get("duration_min", 30))
    elif shock_type == "rain":
        shock_event["duration_min"] = int(body.get("duration_min", 40))
    elif shock_type == "delay":
        shock_event["order_id"] = str(body.get("order_id", "ORD-LIVE"))
        shock_event["slip_min"] = int(body.get("slip_min", 12))

    _pending_shocks.append(shock_event)
    _sim_state["active_shocks"].append(shock_event)

    return {
        "queued": True,
        "shock_type": shock_type,
        "sim_time": shock_event["sim_time"],
        "active_shocks_count": len(_sim_state["active_shocks"]),
    }


# ── GET /status ──────────────────────────────────────────────────────────────
@app.get("/status")
async def status() -> dict[str, Any]:
    """
    Current simulation and model status.
    Used by the frontend TopBar to show model_connection, vehicle, and active_shocks.
    """
    return {
        "degraded": _decider._model.is_degraded,
        "model_connection": "degraded" if _decider._model.is_degraded else "online",
        "sim_time": _sim_state["sim_time"],
        "events_emitted": _sim_state["events_emitted"],
        "active_shocks": _sim_state["active_shocks"],
        "reservation_wage_mxn_hr": _decider._reservation_wage,
        "vehicle": _sim_state["vehicle"],
    }


# ── POST /model_failure ───────────────────────────────────────────────────────
@app.post("/model_failure")
async def model_failure(body: dict[str, Any]) -> dict[str, Any]:
    """
    Toggle degraded mode for live demos (Req 5).
    Body: { "failed": true|false }
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


# ── GET /replay/log ──────────────────────────────────────────────────────────
@app.get("/replay/log")
async def replay_log(
    seed: int = Query(default=1),
    n_offers: int = Query(default=30),
    vehicle: str = Query(default="moto"),
) -> dict[str, Any]:
    """
    Generate and return a complete deterministic shift log for Replay mode.
    If a live simulation was run matching this seed, returns the exact recorded events.
    Otherwise, generates the identical deterministic run matching /events.
    """
    # 1. Return recorded live stream if available and matching seed
    if _last_stream_events and len(_last_stream_events) > 2:
        start_ev = next((e for e in _last_stream_events if e.get("event") == "shift_start"), None)
        if start_ev and start_ev.get("seed") == seed:
            return {"seed": seed, "count": len(_last_stream_events), "events": _last_stream_events}

    # 2. Deterministic generator strictly matching /events logic
    dec = CourierDecider(vehicle_type=vehicle)
    gen = EventGenerator(seed=seed, n_offers=n_offers, vehicle=vehicle)
    events: list[dict[str, Any]] = []

    current_zone = 7
    our_earnings = 0.0
    our_completed = 0
    our_accepted = 0
    our_rejected = 0
    our_violations = 0

    base_earnings = 0.0
    base_completed = 0
    base_accepted = 0
    base_rejected = 0
    base_violations = 0

    sim_time = "2026-03-21T15:00:00"

    for raw in gen.stream():
        ev_type = raw.get("event")
        sim_time = raw.get("sim_time", sim_time)

        if ev_type == "shift_start":
            current_zone = raw.get("start_location_zone", 7)
            events.append(raw)
            continue
        elif ev_type == "shock":
            events.append(raw)
            strat_ev = {
                "event": "strategy_update",
                "sim_time": sim_time,
                "reservation_wage_mxn_hr": dec._reservation_wage,
                "target_zone": raw.get("zone", current_zone),
                "reasoning": f"Holding strategy; monitoring {raw.get('shock_type')} shock.",
                "confidence": "high",
                "degraded": dec._model.is_degraded,
            }
            events.append(strat_ev)
            continue
        elif ev_type == "order_offered":
            events.append(raw)
            r = dec.decide(raw)
            order_id = raw["order_id"]
            _explain_log[order_id] = {
                "order_id": order_id,
                "decision": r["decision"],
                "reason": r["reason"],
                "binding_constraint": r.get("binding_constraint"),
                "inputs": {
                    "position_zone": raw.get("zone_pickup"),
                    "zone_dropoff": raw.get("zone_dropoff"),
                    "sim_time": sim_time,
                    "distance_pickup_km": raw.get("distance_pickup_km", 0.0),
                    "distance_delivery_km": raw.get("distance_delivery_km", 0.0),
                    "base_pay_mxn": raw.get("base_pay_mxn", 0.0),
                    "surge_multiplier": raw.get("surge_multiplier", 1.0),
                    "vehicle": vehicle,
                    "economics": r.get("economics"),
                },
                "alternatives_considered": _build_alternatives(r),
            }

            base_dec = _decide_baseline(raw, vehicle=vehicle)
            if base_dec["decision"] == "ACCEPT":
                base_accepted += 1
                base_completed += 1
                base_earnings += max(0.0, base_dec["net_pay"])
                if base_dec["safety_violation"]:
                    base_violations += 1
            else:
                base_rejected += 1

            dec_ev = {
                "event": "decision",
                "order_id": order_id,
                "sim_time": sim_time,
                "decision": r["decision"],
                "reason": r["reason"],
                "latency_ms": r["latency_ms"],
                "binding_constraint": r.get("binding_constraint"),
                "tier": r.get("tier", "tier1"),
                "degraded": r.get("degraded", False),
                "economics": r.get("economics"),
                "baseline": {
                    "name": "GreedyRate",
                    "decision": base_dec["decision"],
                    "reason": base_dec["reason"],
                    "safety_violations": base_violations,
                    "earnings_mxn": round(base_earnings, 2),
                    "orders_completed": base_completed,
                    "orders_accepted": base_accepted,
                    "orders_rejected": base_rejected,
                },
            }
            events.append(dec_ev)

            if r["decision"] == "ACCEPT":
                our_accepted += 1
                our_completed += 1
                net = float((r.get("economics") or {}).get("net_pay_mxn", raw.get("base_pay_mxn", 40.0)))
                our_earnings += max(0.0, net)
                events.append({"event": "position_update", "sim_time": sim_time, "zone": raw["zone_pickup"], "status": "to_pickup"})
                events.append({"event": "position_update", "sim_time": sim_time, "zone": raw["zone_dropoff"], "status": "to_dropoff"})
                rate = (our_earnings / max(our_completed * 0.35, 0.5)) * 1.0
                events.append({"event": "earnings_update", "sim_time": sim_time, "earnings_mxn": round(our_earnings, 2), "orders_completed": our_completed, "mxn_per_hr": round(rate, 2)})
            else:
                our_rejected += 1
                events.append({"event": "position_update", "sim_time": sim_time, "zone": current_zone, "status": "idle"})
        elif ev_type == "shift_end":
            shift_end_ev = {
                "event": "shift_end",
                "sim_time": sim_time,
                "orders_offered": our_accepted + our_rejected,
                "orders_completed": our_completed,
                "earnings_mxn": round(our_earnings, 2),
                "safety_violations": our_violations,
            }
            events.append(shift_end_ev)

    events.append({"event": "stream_end", "sim_time": sim_time})
    return {"seed": seed, "count": len(events), "events": events}


# ── GET /explain_decision/all ────────────────────────────────────────────────
@app.get("/explain_decision/all")
async def explain_all() -> dict[str, Any]:
    """Return all stored decision explanations."""
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
    return [
        {
            "option": "ACCEPT this order",
            "rejected_because": "Order did not meet acceptance criteria."
        }
    ]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.api.server:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=["src"],
    )
