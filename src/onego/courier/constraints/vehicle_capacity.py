"""
Constraint: vehicle_capacity
Req 3.5 — If the order's weight or volume exceeds the vehicle's remaining
capacity (accounting for in-flight orders), SKIP with
binding_constraint="vehicle_capacity".

Safety-over-pay invariance: checked before pay arithmetic.
"""
from __future__ import annotations

# Vehicle capacity profiles (must match economics.py VEHICLE_PROFILES)
VEHICLE_PROFILES: dict[str, dict] = {
    "bike": {"max_weight_kg": 10.0, "max_volume_liters": 20.0},
    "moto": {"max_weight_kg": 15.0, "max_volume_liters": 30.0},
    "car":  {"max_weight_kg": 50.0, "max_volume_liters": 200.0},
}

# Default vehicle when not specified
DEFAULT_VEHICLE = "moto"


def check(order: dict, state: dict) -> dict | None:
    """
    Returns a binding result dict if the constraint fires, else None.

    Reads from order (matches order_offered in event_log_schema.json):
        weight_kg       — weight of this order (optional; 0 if absent)
        volume_liters   — volume of this order (optional; 0 if absent)
        vehicle         — vehicle type override for this order (optional)

    Reads from state:
        vehicle         — active vehicle type ("bike", "moto", "car")
        in_flight_orders — list of in-flight order dicts, each with optional
                           weight_kg and volume_liters (to compute used capacity)

    Schema contract:
        decision           = "SKIP"
        binding_constraint = "vehicle_capacity"
        reason             ≤ 40 words
        tier               = "tier1"
    """
    vehicle_type: str = (
        order.get("vehicle") or state.get("vehicle", DEFAULT_VEHICLE)
    ).lower()
    profile = VEHICLE_PROFILES.get(vehicle_type, VEHICLE_PROFILES[DEFAULT_VEHICLE])

    order_weight = float(order.get("weight_kg", 0) or 0)
    order_volume = float(order.get("volume_liters", 0) or 0)

    # Capacity already used by in-flight orders
    in_flight: list[dict] = state.get("in_flight_orders", []) or []
    used_weight = sum(float(o.get("weight_kg", 0) or 0) for o in in_flight)
    used_volume = sum(float(o.get("volume_liters", 0) or 0) for o in in_flight)

    available_weight = profile["max_weight_kg"] - used_weight
    available_volume = profile["max_volume_liters"] - used_volume

    weight_exceeded = order_weight > 0 and order_weight > available_weight
    volume_exceeded = order_volume > 0 and order_volume > available_volume

    if weight_exceeded or volume_exceeded:
        which = []
        if weight_exceeded:
            which.append(
                f"weight {order_weight}kg > {available_weight:.1f}kg available"
            )
        if volume_exceeded:
            which.append(
                f"volume {order_volume}L > {available_volume:.1f}L available"
            )
        detail = "; ".join(which)
        return {
            "decision": "SKIP",
            "binding_constraint": "vehicle_capacity",
            "reason": (
                f"Vehicle capacity exceeded on {vehicle_type}: {detail}. "
                f"In-flight: {len(in_flight)} order(s)."
            ),
            "tier": "tier1",
        }
    return None
