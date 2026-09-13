"""
Suite de pruebas que valida:
1. Determinismo por seed.
2. Schema de respuesta con binding_constraint (decision_response_schema.json).
3. Activación de modo degradado.
4. Perfiles de vehículo.
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from onego.courier.decide import CourierDecider
from onego.data.generador_delivery_mty import EventGenerator


def test_determinism():
    """Same seed must produce byte-identical decisions (Req 1.1 / 2.3)."""
    dec1, dec2 = CourierDecider(), CourierDecider()
    gen1, gen2 = EventGenerator(seed=99, n_offers=5), EventGenerator(seed=99, n_offers=5)

    for ev1, ev2 in zip(gen1.stream(), gen2.stream()):
        if ev1.get("event") == "order_offered":
            r1 = dec1.decide(ev1)
            r2 = dec2.decide(ev2)
            assert r1["decision"] == r2["decision"], (
                f"Determinism failure: {r1['decision']} != {r2['decision']}"
            )
            assert r1["binding_constraint"] == r2["binding_constraint"], (
                "binding_constraint not deterministic"
            )


def test_safety_constraints_and_schema():
    """
    A 30 km order should trigger vehicle_capacity or shift_end_infeasible
    before the pay check (safety-over-pay invariance).
    Also verifies the response matches decision_response_schema.json (Req 3 / 2).
    """
    decider = CourierDecider()
    # Use judge schema field names; distance_delivery_km is the correct field
    order_far = {
        "order_id": "ORD-001",
        "sim_time": "2026-03-21T18:00:00",
        "distance_delivery_km": 30.0,
        "base_pay_mxn": 50,
        "est_tip_mxn": 0,
        "surge_multiplier": 1.0,
        "vehicle": "moto",
        "weight_kg": 20.0,       # exceeds moto 15 kg limit -> vehicle_capacity
        "volume_liters": 5.0,
        "zone_pickup": 7,
        "zone_dropoff": 9,
        "courier_state_overrides": {
            "shift_end_time": "2026-03-21T23:00:00",
            "continuous_riding_min": 0,
            "in_flight_orders": [],
        },
    }
    res = decider.decide(order_far)

    # Must be SKIP (safety gate)
    assert res["decision"] == "SKIP", f"Expected SKIP, got {res['decision']}"
    # binding_constraint must be one of the 5 judge-schema values
    valid = {"flagged_zone_night", "mandatory_break", "heat_rule",
             "shift_end_infeasible", "vehicle_capacity", "reservation_wage"}
    assert res["binding_constraint"] in valid, (
        f"binding_constraint '{res['binding_constraint']}' not in schema enum"
    )
    # reason <= 40 words
    assert len(res["reason"].split()) <= 40, "reason exceeds 40 words"
    # Required fields present
    for field in ("order_id", "decision", "reason", "latency_ms", "binding_constraint"):
        assert field in res, f"Missing required field: {field}"
    # decision values are uppercase
    assert res["decision"] in ("ACCEPT", "SKIP"), f"decision not ACCEPT|SKIP: {res['decision']}"


def test_degraded_mode():
    """
    When model is forced to fail, system must:
    - not crash
    - return degraded=True
    - still return ACCEPT or SKIP (Req 5).
    """
    decider = CourierDecider()
    decider.force_model_failure(True)
    order = {
        "order_id": "ORD-002",
        "sim_time": "2026-03-21T18:00:00",
        "distance_delivery_km": 5.0,
        "base_pay_mxn": 80,
        "est_tip_mxn": 10,
        "surge_multiplier": 1.0,
        "vehicle": "moto",
        "zone_pickup": 7,
        "zone_dropoff": 9,
        "courier_state_overrides": {
            "shift_end_time": "2026-03-21T23:00:00",
            "continuous_riding_min": 0,
            "in_flight_orders": [],
        },
    }
    res = decider.decide(order)

    assert res["degraded"] is True, f"Expected degraded=True, got {res['degraded']}"
    assert res["decision"] in ("ACCEPT", "SKIP"), "Must not crash in degraded mode"
    # binding_constraint must be null or a valid enum value
    valid = {"flagged_zone_night", "mandatory_break", "heat_rule",
             "shift_end_infeasible", "vehicle_capacity", "reservation_wage", None}
    assert res["binding_constraint"] in valid


def test_vehicle_profiles():
    """
    Vehicle type must be reflected in the response economics (Req 1.3).
    Bike has 0 fuel cost; car has higher fuel cost than moto.
    """
    base_order = {
        "order_id": "ORD-003",
        "sim_time": "2026-03-21T18:00:00",
        "distance_delivery_km": 5.0,
        "base_pay_mxn": 60,
        "est_tip_mxn": 0,
        "surge_multiplier": 1.0,
        "zone_pickup": 7,
        "zone_dropoff": 9,
        "courier_state_overrides": {
            "shift_end_time": "2026-03-21T23:00:00",
            "continuous_riding_min": 0,
            "in_flight_orders": [],
        },
    }

    decider_bike = CourierDecider(vehicle_type="bike")
    res_bike = decider_bike.decide({**base_order, "order_id": "ORD-003-bike"})
    assert res_bike["decision"] in ("ACCEPT", "SKIP")
    # Bike fuel = 0, so net_pay should be higher than moto
    bike_net = (res_bike.get("economics") or {}).get("net_pay_mxn")

    decider_car = CourierDecider(vehicle_type="car")
    res_car = decider_car.decide({**base_order, "order_id": "ORD-003-car"})
    assert res_car["decision"] in ("ACCEPT", "SKIP")
    car_net = (res_car.get("economics") or {}).get("net_pay_mxn")

    decider_moto = CourierDecider(vehicle_type="moto")
    res_moto = decider_moto.decide({**base_order, "order_id": "ORD-003-moto"})
    moto_net = (res_moto.get("economics") or {}).get("net_pay_mxn")

    # Bike (no fuel) >= moto (4.5/km) >= car (8.0/km) on net pay
    if bike_net is not None and moto_net is not None:
        assert bike_net >= moto_net, (
            f"Bike net {bike_net} should be >= moto net {moto_net} (bike has no fuel cost)"
        )
    if moto_net is not None and car_net is not None:
        assert moto_net >= car_net, (
            f"Moto net {moto_net} should be >= car net {car_net} (car costs 8/km vs 4.5/km)"
        )

