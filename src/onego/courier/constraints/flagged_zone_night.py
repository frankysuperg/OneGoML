"""
Constraint: flagged_zone_night
Req 3.1 — If the dropoff zone is flagged AND the sim_time hour >= 22:00,
SKIP with binding_constraint="flagged_zone_night".

Safety-over-pay invariance: this check runs before any pay arithmetic.
"""
from __future__ import annotations

# Zones considered high-risk at night. Populated from the event schema zone ids.
# In the real simulator this list comes from the map metadata; here it is the
# initial seed set. Add zone ids as the simulator map grows.
FLAGGED_ZONES: frozenset[int] = frozenset({
    2,   # Centro MTY (risk=1 in generador)
    5,   # Santa Catarina (risk=1 in generador)
    13,  # placeholder — add real zone ids when simulator map is wired
})

NIGHT_HOUR = 22  # 22:00 local sim time


def check(order: dict, state: dict) -> dict | None:
    """
    Returns a binding result dict if the constraint fires, else None.

    Args:
        order: the order_offered fields (zone_dropoff, sim_time, …).
        state: courier state (may include overrides already applied).

    Schema contract (decision_response_schema.json):
        decision           = "SKIP"
        binding_constraint = "flagged_zone_night"
        reason             ≤ 40 words, names this constraint
        tier               = "tier1"
    """
    zone_dropoff = order.get("zone_dropoff")
    sim_time: str = order.get("sim_time", state.get("sim_time", ""))

    # Parse hour from ISO sim_time string — never use wall-clock datetime.now()
    hour = _parse_hour(sim_time)
    if hour is None:
        return None  # cannot evaluate without sim_time; fail open

    if zone_dropoff in FLAGGED_ZONES and hour >= NIGHT_HOUR:
        return {
            "decision": "SKIP",
            "binding_constraint": "flagged_zone_night",
            "reason": (
                f"Dropoff zone {zone_dropoff} is flagged; deliveries prohibited after "
                f"{NIGHT_HOUR}:00 (current sim time {hour:02d}:xx)."
            ),
            "tier": "tier1",
        }
    return None


def _parse_hour(sim_time: str) -> int | None:
    """Extract the hour from an ISO-8601 sim_time string without calling datetime.now()."""
    try:
        # Handles "2026-03-21T22:05:00" and "2026-03-21T22:05:00Z"
        time_part = sim_time.split("T")[1].split("Z")[0]
        return int(time_part.split(":")[0])
    except (IndexError, ValueError):
        return None
