import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

import pytest
from onego.ai.explainer import AIDecisionExplainer


def test_ai_explainer_accept_order():
    explainer = AIDecisionExplainer()
    inputs = {
        "vehicle": "moto",
        "distance_pickup_km": 0.8,
        "distance_delivery_km": 4.2,
        "base_pay_mxn": 80.0,
        "est_tip_mxn": 25.0,
        "surge_multiplier": 1.5,
        "weight_kg": 3.5,
        "position_zone": 7,
        "zone_dropoff": 5,
        "economics": {
            "net_pay_mxn": 122.5,
            "adjusted_rate_mxn_hr": 245.0,
            "reservation_wage_mxn_hr": 185.0,
        },
    }
    result = explainer.explain(
        order_id="ORD-ACC-01",
        decision="ACCEPT",
        reason="Rate 245 clears reservation wage 185",
        inputs=inputs,
        binding_constraint=None,
    )
    assert result["order_id"] == "ORD-ACC-01"
    assert result["decision"] == "ACCEPT"
    assert result["verdict_category"] == "ACEPTADA_ALTA_RENTABILIDAD"
    assert "aprobado con excelente rentabilidad" in result["executive_summary"]
    assert result["confidence_score"] >= 0.90
    assert result["financial_breakdown"]["net_pay_mxn"] == 122.5
    assert result["safety_breakdown"]["passed_all_gates"] is True


def test_ai_explainer_skip_reservation_wage():
    explainer = AIDecisionExplainer()
    inputs = {
        "vehicle": "moto",
        "distance_pickup_km": 3.5,
        "distance_delivery_km": 8.0,
        "base_pay_mxn": 40.0,
        "surge_multiplier": 1.0,
        "weight_kg": 4.0,
        "position_zone": 7,
        "zone_dropoff": 11,
        "economics": {
            "net_pay_mxn": -11.75,
            "adjusted_rate_mxn_hr": 35.0,
            "reservation_wage_mxn_hr": 185.0,
        },
    }
    result = explainer.explain(
        order_id="ORD-SKIP-01",
        decision="SKIP",
        reason="Rate 35 below reservation wage 185",
        inputs=inputs,
        binding_constraint="reservation_wage",
    )
    assert result["decision"] == "SKIP"
    assert result["verdict_category"] == "RECHAZADA_TARIFA_INSUFICIENTE"
    assert "rentabilidad insuficiente" in result["executive_summary"]
    assert result["financial_breakdown"]["deadhead_km"] == 3.5
    assert result["financial_breakdown"]["rate_delta_mxn_hr"] < 0


def test_ai_explainer_skip_vehicle_capacity():
    explainer = AIDecisionExplainer()
    inputs = {
        "vehicle": "moto",
        "distance_pickup_km": 1.0,
        "distance_delivery_km": 3.0,
        "weight_kg": 18.5,
        "position_zone": 5,
        "zone_dropoff": 7,
    }
    result = explainer.explain(
        order_id="ORD-CAP-01",
        decision="SKIP",
        reason="Weight 18.5kg exceeds 15kg limit",
        inputs=inputs,
        binding_constraint="vehicle_capacity",
    )
    assert result["decision"] == "SKIP"
    assert result["verdict_category"] == "RECHAZADA_CAPACIDAD_EXCEDIDA"
    assert "seguridad física del vehículo" in result["executive_summary"]
    assert result["safety_breakdown"]["passed_all_gates"] is False
    assert result["safety_breakdown"]["binding_constraint"] == "vehicle_capacity"
