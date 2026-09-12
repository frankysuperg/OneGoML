"""
Suite de pruebas que valida:
1. Determinismo por seed.
2. Schema de respuesta con binding_constraint.
3. Activación de modo degradado.
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
    dec1, dec2 = CourierDecider(), CourierDecider()
    gen1, gen2 = EventGenerator(seed=99, n_offers=5), EventGenerator(seed=99, n_offers=5)
    
    for ev1, ev2 in zip(gen1.stream(), gen2.stream()):
        if ev1["event_type"] == "OFFER":
            assert dec1.decide(ev1) == dec2.decide(ev2), "Fallo de determinismo: decisiones no son byte-identical"

def test_safety_constraints_and_schema():
    decider = CourierDecider()
    order_far = {"order_id": "ORD-001", "distance_km": 30.0, "base_pay": 50, "tip": 0}
    res_far = decider.decide(order_far)
    
    assert res_far["action"] == "REJECT"
    assert res_far["binding_constraint"] == "SAFETY_MAX_DISTANCE"
    assert len(res_far["explanation"].split()) <= 40, "Explicación excede 40 palabras"
    assert "binding_constraint" in res_far, "Falta campo crítico binding_constraint"

def test_degraded_mode():
    decider = CourierDecider()
    decider.force_model_failure(True)
    order = {"order_id": "ORD-002", "distance_km": 5.0, "base_pay": 80, "tip": 10}
    res = decider.decide(order)
    
    assert res["metrics"]["is_degraded_mode"] is True
    assert res["binding_constraint"] == "DEGRADED_MODE_FALLBACK"
    assert res["action"] in ("ACCEPT", "REJECT") # No debe crashear, debe usar fallback

def test_vehicle_profiles():
    decider = CourierDecider(vehicle_type="bike")
    order = {"order_id": "ORD-003", "distance_km": 5.0, "base_pay": 60, "tip": 0}
    res = decider.decide(order)
    assert res["metrics"]["vehicle_type"] == "bike"
    
    decider.set_vehicle("car")
    res_car = decider.decide(order)
    assert res_car["metrics"]["vehicle_type"] == "car"
    # El costo de combustible y tiempo debe ser diferente internamente
