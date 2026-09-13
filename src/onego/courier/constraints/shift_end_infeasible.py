"""
Constraint: shift_end_infeasible
Req 3.4 — If completing the order would require more time than remains before
shift_end_time, SKIP with binding_constraint="shift_end_infeasible".

shift_end_time is NEVER hardcoded — it is always read from state
(courier_state_overrides or the live shift state).

Safety-over-pay invariance: checked before pay arithmetic.
"""
from __future__ import annotations

# Safety buffer in minutes: we SKIP if completing the order leaves less than
# this margin before shift end, to account for transit back to base.
SHIFT_END_SAFETY_BUFFER_MIN: float = 5.0


def check(order: dict, state: dict, estimated_time_min: float | None = None) -> dict | None:
    """
    Returns a binding result dict if the constraint fires, else None.

    Reads from order:
        sim_time              — current simulation time (ISO-8601)
        estimated_delivery_min — total time to complete order (optional; if absent
                                 we use estimated_time_min arg or a conservative
                                 heuristic from distance)

    Reads from state:
        shift_end_time        — ISO-8601 string (REQUIRED; from state/overrides)

    Args:
        estimated_time_min: time estimate from ML model (minutes). If None,
                            we fall back to a distance-based heuristic.

    Schema contract:
        decision           = "SKIP"
        binding_constraint = "shift_end_infeasible"
        reason             ≤ 40 words
        tier               = "tier1"
    """
    sim_time: str = order.get("sim_time", state.get("sim_time", ""))
    shift_end_time: str = state.get("shift_end_time", "")

    if not sim_time or not shift_end_time:
        return None  # cannot evaluate without times; fail open

    remaining_min = _minutes_between(sim_time, shift_end_time)
    if remaining_min is None:
        return None

    # Determine how long the order would take
    order_time_min = _estimate_order_time(order, estimated_time_min)

    if order_time_min + SHIFT_END_SAFETY_BUFFER_MIN > remaining_min:
        return {
            "decision": "SKIP",
            "binding_constraint": "shift_end_infeasible",
            "reason": (
                f"Order requires ~{order_time_min:.0f} min but only "
                f"{remaining_min:.0f} min remain before shift end; "
                f"cannot complete before {_fmt_time(shift_end_time)}."
            ),
            "tier": "tier1",
        }
    return None


def _estimate_order_time(order: dict, ml_estimate: float | None) -> float:
    """Best available estimate of total order time in minutes."""
    if ml_estimate is not None and ml_estimate > 0:
        return ml_estimate
    # Use explicit field if present (from order_offered schema)
    explicit = order.get("estimated_delivery_min") or order.get("estimated_pickup_min")
    if explicit is not None:
        return float(explicit)
    # Conservative heuristic: 4 min/km + 5 min handling
    distance = float(order.get("distance_delivery_km", order.get("distance_km", 5.0)))
    return distance * 4.0 + 5.0


def _minutes_between(start_iso: str, end_iso: str) -> float | None:
    """Return (end - start) in minutes using only stdlib, no wall clock."""
    try:
        from datetime import datetime
        fmt = "%Y-%m-%dT%H:%M:%S"
        s = datetime.strptime(start_iso.rstrip("Z").split("+")[0], fmt)
        e = datetime.strptime(end_iso.rstrip("Z").split("+")[0], fmt)
        return (e - s).total_seconds() / 60.0
    except (ValueError, AttributeError):
        return None


def _fmt_time(iso: str) -> str:
    try:
        return iso.split("T")[1][:5]
    except IndexError:
        return iso
