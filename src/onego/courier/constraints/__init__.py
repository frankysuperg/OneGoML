"""
Safety constraint pipeline for the Fast Path (Tier 1).

Evaluation order (design.md § Fast Path — mandatory):
  1. vehicle_capacity
  2. shift_end_infeasible
  3. mandatory_break  (all hours)
  4. heat_rule        (12:00–16:00 window only)
  5. flagged_zone_night

All checks run before any pay arithmetic. The first firing constraint wins
and the function returns immediately — no later check can override a safety SKIP.

Each constraint lives in its own file so a judge can open it in seconds.
"""
from __future__ import annotations

from . import (
    vehicle_capacity,
    shift_end_infeasible,
    mandatory_break,
    heat_rule,
    flagged_zone_night,
)

# Ordered list — must not be reordered without updating design.md
_PIPELINE = [
    vehicle_capacity,
    shift_end_infeasible,
    mandatory_break,
    heat_rule,
    flagged_zone_night,
]


def run_safety_checks(
    order: dict,
    state: dict,
    estimated_time_min: float | None = None,
) -> dict | None:
    """
    Run all safety constraints in mandatory order.

    Returns the first firing constraint's result dict, or None if all pass.

    Args:
        order:              order_offered fields (from /decide request body).
        state:              courier state after applying courier_state_overrides.
        estimated_time_min: ML time estimate (minutes) for shift_end_infeasible.

    Returns:
        dict with keys  decision, binding_constraint, reason, tier
        or None if no safety constraint fires.
    """
    for constraint_module in _PIPELINE:
        if constraint_module is shift_end_infeasible:
            # shift_end_infeasible takes an extra arg for the ML time estimate
            result = constraint_module.check(order, state, estimated_time_min)
        else:
            result = constraint_module.check(order, state)

        if result is not None:
            return result

    return None


__all__ = [
    "run_safety_checks",
    "vehicle_capacity",
    "shift_end_infeasible",
    "mandatory_break",
    "heat_rule",
    "flagged_zone_night",
]
