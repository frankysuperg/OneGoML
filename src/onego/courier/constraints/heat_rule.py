"""
Constraint: heat_rule
Req 3.3 — Between 12:00 and 16:00 sim_time, if continuous riding exceeds
90 minutes, SKIP with binding_constraint="heat_rule".

Safety-over-pay invariance: checked before pay arithmetic.
"""
from __future__ import annotations

HEAT_WINDOW_START = 12   # 12:00 sim time
HEAT_WINDOW_END = 16     # 16:00 sim time (exclusive)
HEAT_MAX_CONTINUOUS_MIN: float = 90.0


def check(order: dict, state: dict) -> dict | None:
    """
    Returns a binding result dict if the constraint fires, else None.

    Reads from order:
        sim_time  — ISO-8601 string

    Reads from state:
        continuous_riding_min  — minutes ridden without break

    Schema contract:
        decision           = "SKIP"
        binding_constraint = "heat_rule"
        reason             ≤ 40 words
        tier               = "tier1"
    """
    sim_time: str = order.get("sim_time", state.get("sim_time", ""))
    hour = _parse_hour(sim_time)
    if hour is None:
        return None  # cannot evaluate; fail open

    if not (HEAT_WINDOW_START <= hour < HEAT_WINDOW_END):
        return None  # outside heat window

    continuous_min: float = float(state.get("continuous_riding_min", 0))
    if continuous_min > HEAT_MAX_CONTINUOUS_MIN:
        return {
            "decision": "SKIP",
            "binding_constraint": "heat_rule",
            "reason": (
                f"Heat rule: {continuous_min:.0f} min continuous riding exceeds "
                f"{HEAT_MAX_CONTINUOUS_MIN:.0f} min limit during midday heat window "
                f"({HEAT_WINDOW_START}:00–{HEAT_WINDOW_END}:00)."
            ),
            "tier": "tier1",
        }
    return None


def _parse_hour(sim_time: str) -> int | None:
    try:
        time_part = sim_time.split("T")[1].split("Z")[0]
        return int(time_part.split(":")[0])
    except (IndexError, ValueError):
        return None
