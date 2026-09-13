"""
CourierDecider — Fast Path entry point (Tier 1).

Wraps the ML model + safety constraint pipeline and produces responses
that match decision_response_schema.json exactly:

    {
      "order_id":           str,
      "decision":           "ACCEPT" | "SKIP",
      "reason":             str (≤ 40 words),
      "binding_constraint": "flagged_zone_night" | "mandatory_break" |
                            "heat_rule" | "shift_end_infeasible" |
                            "vehicle_capacity" | "reservation_wage" | null,
      "latency_ms":         float,
      "tier":               "tier1",
      "degraded":           bool,
      "economics":          { ... }   # optional
    }

Usage (demo_live.py / tests):
    decider = CourierDecider(vehicle_type="moto")
    result  = decider.decide(order_event)

    decider.force_model_failure(True)   # simulate degraded mode
    decider.set_vehicle("bike")
    decider.update_context(continuous_riding_min=91)
"""
from __future__ import annotations

import time
from typing import Any

from onego.models.ml_models import DeliveryMLModel
from onego.courier.constraints import run_safety_checks

# Default reservation wage (MXN / hr).  The Strategy Layer (Tier 2) will
# update this value at runtime; the Fast Path reads it from this cache.
DEFAULT_RESERVATION_WAGE_MXN_HR: float = 185.0

# Minimum acceptable earnings-per-minute derived from reservation wage
def _wage_hr_to_epm(wage_hr: float) -> float:
    return wage_hr / 60.0


class CourierDecider:
    """
    Fast Path decision engine.  All methods are pure / synchronous.
    No LLM calls, no network I/O — deterministic given the same input.
    """

    def __init__(
        self,
        vehicle_type: str = "moto",
        reservation_wage_mxn_hr: float = DEFAULT_RESERVATION_WAGE_MXN_HR,
        model_dir: str = "artifacts",
    ) -> None:
        self._vehicle = vehicle_type.lower()
        self._reservation_wage = reservation_wage_mxn_hr
        self._model = DeliveryMLModel(model_dir=model_dir)
        self._model.train()          # no-op if .pkl files already exist

        # Mutable courier state — overridden per-request by courier_state_overrides
        self._state: dict[str, Any] = {
            "vehicle": self._vehicle,
            "continuous_riding_min": 0.0,
            "shift_elapsed_hours": 0.0,
            "shift_end_time": "",
            "in_flight_orders": [],
            "last_break_end_time": None,
        }

    # ------------------------------------------------------------------
    # State mutation helpers (used by demo_live.py and tests)
    # ------------------------------------------------------------------

    def update_context(self, **kwargs: Any) -> None:
        """Merge kwargs into the persistent courier state."""
        self._state.update(kwargs)

    def force_model_failure(self, failed: bool) -> None:
        """Simulate ML model being unreachable (degraded mode)."""
        self._model.is_degraded = failed

    def set_vehicle(self, vehicle_type: str) -> None:
        """Change the active vehicle profile."""
        self._vehicle = vehicle_type.lower()
        self._state["vehicle"] = self._vehicle

    def set_reservation_wage(self, wage_mxn_hr: float) -> None:
        """Called by Strategy Layer (Tier 2) to update the reservation wage."""
        self._reservation_wage = wage_mxn_hr

    # ------------------------------------------------------------------
    # Core decision method
    # ------------------------------------------------------------------

    def decide(self, order: dict[str, Any]) -> dict[str, Any]:
        """
        Evaluate an order_offered event and return a decide_response.

        Args:
            order: dict matching order_offered in event_log_schema.json.
                   May contain a nested "courier_state_overrides" key.

        Returns:
            dict matching decision_response_schema.json decide_response.
        """
        t_start = time.perf_counter()

        # 1. Apply courier_state_overrides (never mutates global state)
        state = dict(self._state)
        state["vehicle"] = self._vehicle
        overrides: dict = order.get("courier_state_overrides") or {}
        state.update(overrides)

        # Propagate sim_time from order into state for constraint checks
        if "sim_time" in order:
            state.setdefault("sim_time", order["sim_time"])

        order_id: str = order.get("order_id", order.get("event_id", "UNKNOWN"))

        # 2. Get ML time estimate (used by shift_end_infeasible)
        ml_prediction = self._model.predict(_order_to_ml_features(order, state))
        estimated_time_min: float = ml_prediction.estimated_time_minutes

        deadhead_km = round(float(order.get("distance_pickup_km", 0.0) or 0.0), 2)

        # 3. Safety checks — MUST run before pay arithmetic (safety-over-pay)
        safety_result = run_safety_checks(order, state, estimated_time_min)
        if safety_result is not None:
            latency_ms = (time.perf_counter() - t_start) * 1000
            net_pay = _compute_net_pay(order, state)
            raw_rate_hr = (net_pay / max(estimated_time_min, 1.0)) * 60.0
            return _build_response(
                order_id=order_id,
                decision=safety_result["decision"],
                reason=_truncate_reason(safety_result["reason"]),
                binding_constraint=safety_result["binding_constraint"],
                latency_ms=latency_ms,
                degraded=ml_prediction.is_degraded,
                economics={
                    "net_pay_mxn": round(net_pay, 2),
                    "total_time_min": round(estimated_time_min, 2),
                    "raw_rate_mxn_hr": round(raw_rate_hr, 2),
                    "adjusted_rate_mxn_hr": round(raw_rate_hr, 2),
                    "reservation_wage_mxn_hr": self._reservation_wage,
                    "deadhead_km": deadhead_km,
                },
            )

        # 4. Pay criterion — reservation wage check
        required_epm = _wage_hr_to_epm(self._reservation_wage)
        eval_epm = (
            ml_prediction.pessimistic_epm
            if ml_prediction.uncertainty_range_minutes > 12.0
            else ml_prediction.projected_earnings_per_min
        )

        net_pay = _compute_net_pay(order, state)
        raw_rate_hr = (net_pay / max(estimated_time_min, 1.0)) * 60.0
        adjusted_rate_hr = raw_rate_hr  # Strategy Layer adjusts this via reservation_wage

        latency_ms = (time.perf_counter() - t_start) * 1000

        if eval_epm >= required_epm:
            return _build_response(
                order_id=order_id,
                decision="ACCEPT",
                reason=(
                    f"Adjusted rate {adjusted_rate_hr:.0f} MXN/hr clears "
                    f"reservation wage {self._reservation_wage:.0f} MXN/hr; "
                    f"all safety gates open."
                ),
                binding_constraint=None,
                latency_ms=latency_ms,
                degraded=ml_prediction.is_degraded,
                economics={
                    "net_pay_mxn": round(net_pay, 2),
                    "total_time_min": round(estimated_time_min, 2),
                    "raw_rate_mxn_hr": round(raw_rate_hr, 2),
                    "adjusted_rate_mxn_hr": round(adjusted_rate_hr, 2),
                    "reservation_wage_mxn_hr": self._reservation_wage,
                    "deadhead_km": deadhead_km,
                },
            )
        else:
            return _build_response(
                order_id=order_id,
                decision="SKIP",
                reason=(
                    f"Adjusted rate {adjusted_rate_hr:.0f} MXN/hr below "
                    f"reservation wage {self._reservation_wage:.0f} MXN/hr."
                ),
                binding_constraint="reservation_wage",
                latency_ms=latency_ms,
                degraded=ml_prediction.is_degraded,
                economics={
                    "net_pay_mxn": round(net_pay, 2),
                    "total_time_min": round(estimated_time_min, 2),
                    "raw_rate_mxn_hr": round(raw_rate_hr, 2),
                    "adjusted_rate_mxn_hr": round(adjusted_rate_hr, 2),
                    "reservation_wage_mxn_hr": self._reservation_wage,
                    "deadhead_km": deadhead_km,
                },
            )


# ------------------------------------------------------------------
# Private helpers
# ------------------------------------------------------------------

def _build_response(
    order_id: str,
    decision: str,
    reason: str,
    binding_constraint: str | None,
    latency_ms: float,
    degraded: bool,
    economics: dict | None = None,
) -> dict[str, Any]:
    resp: dict[str, Any] = {
        "order_id": order_id,
        "decision": decision,                  # "ACCEPT" | "SKIP"
        "reason": _truncate_reason(reason),
        "binding_constraint": binding_constraint,
        "latency_ms": round(latency_ms, 2),
        "tier": "tier1",
        "degraded": degraded,
    }
    if economics is not None:
        resp["economics"] = economics
    return resp


def _truncate_reason(reason: str, max_words: int = 40) -> str:
    """Enforce the ≤40-word contract from decision_response_schema.json."""
    words = reason.split()
    if len(words) <= max_words:
        return reason
    return " ".join(words[:max_words]) + "…"


def _order_to_ml_features(order: dict, state: dict) -> dict[str, Any]:
    """Map order_offered + state fields to DeliveryMLModel feature names."""
    distance = float(
        order.get("distance_delivery_km")
        or order.get("distance_km")
        or 3.0
    )
    vehicle = state.get("vehicle", "moto").lower()
    speed_map = {"bike": 0.8, "moto": 1.0, "car": 1.2}
    return {
        "distance_km": distance,
        "base_pay": float(order.get("base_pay_mxn", order.get("base_pay", 0))),
        "tip": float(order.get("est_tip_mxn", order.get("tip", 0))),
        "surge_multiplier": float(order.get("surge_multiplier", 1.0)),
        "hour_of_day": _parse_hour(order.get("sim_time", state.get("sim_time", ""))),
        "traffic_level": int(order.get("traffic_level", 1)),
        "weather_severity": int(order.get("weather_severity", 0)),
        "zone_risk": int(order.get("zone_risk", 0)),
        "batch_size": 1 + len(state.get("in_flight_orders", [])),
        "vehicle_speed_factor": speed_map.get(vehicle, 1.0),
        "is_cross_municipality": int(order.get("is_cross_municipality", 0)),
        "is_mountain_zone": int(order.get("is_mountain_zone", 0)),
        "gonzalitos_bottle_neck": int(order.get("gonzalitos_bottle_neck", 0)),
    }


def _compute_net_pay(order: dict, state: dict) -> float:
    base = float(order.get("base_pay_mxn", order.get("base_pay", 0)))
    tip = float(order.get("est_tip_mxn", order.get("tip", 0)))
    surge = float(order.get("surge_multiplier", 1.0))
    distance = float(
        order.get("distance_delivery_km", order.get("distance_km", 3.0))
    )
    vehicle = state.get("vehicle", "moto").lower()
    fuel_map = {"bike": 0.0, "moto": 4.5, "car": 8.0}
    fuel_cost = distance * fuel_map.get(vehicle, 4.5)
    return base * surge + tip - fuel_cost


def _parse_hour(sim_time: str) -> int:
    try:
        return int(sim_time.split("T")[1].split(":")[0].split("Z")[0])
    except (IndexError, ValueError, AttributeError):
        return 12  # conservative default: assume midday
