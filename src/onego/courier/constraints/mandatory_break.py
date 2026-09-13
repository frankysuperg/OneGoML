"""
Constraint: mandatory_break
Req 3.2 — If the courier has been riding continuously for >= 4 hours (240 min)
without a break, force a mandatory 20-minute break.
SKIP with binding_constraint="mandatory_break".

Safety-over-pay invariance: checked before pay arithmetic.
"""
from __future__ import annotations

CONTINUOUS_RIDING_LIMIT_MIN: float = 240.0   # 4 hours
MANDATORY_BREAK_MIN: float = 20.0


def check(order: dict, state: dict) -> dict | None:
    """
    Returns a binding result dict if the constraint fires, else None.

    State fields read (set by courier_state_overrides or simulator):
        continuous_riding_min  — minutes ridden without a break (float)

    Schema contract:
        decision           = "SKIP"
        binding_constraint = "mandatory_break"
        reason             ≤ 40 words
        tier               = "tier1"
    """
    continuous_min: float = float(
        state.get("continuous_riding_min", 0)
    )

    if continuous_min >= CONTINUOUS_RIDING_LIMIT_MIN:
        elapsed_hr = continuous_min / 60.0
        return {
            "decision": "SKIP",
            "binding_constraint": "mandatory_break",
            "reason": (
                f"Mandatory break required: {elapsed_hr:.1f} h continuous riding "
                f"(limit {CONTINUOUS_RIDING_LIMIT_MIN/60:.0f} h). "
                f"Must rest {MANDATORY_BREAK_MIN:.0f} min before next order."
            ),
            "tier": "tier1",
        }
    return None
