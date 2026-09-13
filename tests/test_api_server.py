import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

import pytest
from fastapi.testclient import TestClient
from src.api.server import app, _explain_log

client = TestClient(app)

PROBE_ORDER = {
    "order_id": "TEST-ORD-001",
    "platform": "rappi",
    "sim_time": "2026-03-21T18:42:00",
    "zone_pickup": 7,
    "zone_dropoff": 11,
    "distance_pickup_km": 1.4,
    "distance_delivery_km": 6.5,
    "base_pay_mxn": 58.0,
    "est_tip_mxn": 12.0,
    "surge_multiplier": 1.3,
    "weight_kg": 2.1,
    "volume_liters": 6.0,
    "vehicle": "moto",
    "courier_state_overrides": {
        "shift_end_time": "2026-03-21T23:00:00",
        "continuous_riding_min": 0,
        "in_flight_orders": [],
    }
}


def test_decide_endpoint_contract():
    """POST /decide must return required fields, valid decision, latency <= 50ms, and reason <= 40 words."""
    res = client.post("/decide", json=PROBE_ORDER)
    assert res.status_code == 200
    data = res.json()

    for key in ("order_id", "decision", "reason", "latency_ms"):
        assert key in data, f"Missing required key '{key}'"

    assert data["order_id"] == "TEST-ORD-001"
    assert data["decision"] in ("ACCEPT", "SKIP")
    assert len(data["reason"].split()) <= 40
    assert data["latency_ms"] <= 50.0
    assert data["tier"] in ("tier1", "tier2")

    if "economics" in data and data["economics"]:
        econ = data["economics"]
        assert "deadhead_km" in econ
        assert "net_pay_mxn" in econ
        assert "reservation_wage_mxn_hr" in econ


def test_explain_decision_endpoint():
    """GET /explain_decision?order_id=... must return explanation recorded by /decide."""
    # Ensure it's in log
    client.post("/decide", json=PROBE_ORDER)

    res = client.get("/explain_decision?order_id=TEST-ORD-001")
    assert res.status_code == 200
    data = res.json()

    for key in ("order_id", "decision", "reason", "inputs", "alternatives_considered"):
        assert key in data, f"Missing key '{key}' in explain_decision"

    assert data["order_id"] == "TEST-ORD-001"
    assert isinstance(data["inputs"], dict)
    assert isinstance(data["alternatives_considered"], list)
    assert len(data["alternatives_considered"]) >= 1
    assert "option" in data["alternatives_considered"][0]
    assert "rejected_because" in data["alternatives_considered"][0]
    assert "ai_explanation" in data
    assert "executive_summary" in data["ai_explanation"]
    assert "financial_breakdown" in data["ai_explanation"]


def test_explain_ai_endpoint():
    """POST /explain_ai must return structured AI breakdown and interpretation."""
    client.post("/decide", json=PROBE_ORDER)
    res = client.post("/explain_ai", json={"order_id": "TEST-ORD-001", "force_local": True})
    assert res.status_code == 200
    data = res.json()
    assert data["order_id"] == "TEST-ORD-001"
    assert "executive_summary" in data
    assert "financial_breakdown" in data
    assert "safety_breakdown" in data
    assert "courier_recommendation" in data
    assert data["confidence_score"] >= 0.90


def test_status_endpoint():
    """GET /status must return simulation state and model connection status."""
    res = client.get("/status")
    assert res.status_code == 200
    data = res.json()

    assert "degraded" in data
    assert "model_connection" in data
    assert "sim_time" in data
    assert "active_shocks" in data
    assert data["model_connection"] in ("online", "degraded")


def test_model_failure_toggle():
    """POST /model_failure must toggle degraded state in both status and /decide."""
    # Force failure
    res_fail = client.post("/model_failure", json={"failed": True})
    assert res_fail.status_code == 200
    assert res_fail.json()["degraded"] is True

    # Check status
    stat = client.get("/status").json()
    assert stat["degraded"] is True
    assert stat["model_connection"] == "degraded"

    # Decisions must now report degraded=True
    dec_res = client.post("/decide", json=PROBE_ORDER).json()
    assert dec_res["degraded"] is True

    # Restore model
    res_restore = client.post("/model_failure", json={"failed": False})
    assert res_restore.status_code == 200
    assert res_restore.json()["degraded"] is False

    stat_restored = client.get("/status").json()
    assert stat_restored["degraded"] is False
    assert stat_restored["model_connection"] == "online"


def test_shock_endpoint():
    """POST /shock must enqueue valid shock types and reject invalid types."""
    valid_shock = {
        "shock_type": "surge",
        "zone": 11,
        "multiplier": 1.8,
        "duration_min": 30,
    }
    res = client.post("/shock", json=valid_shock)
    assert res.status_code == 200
    assert res.json()["queued"] is True

    invalid_shock = {
        "shock_type": "tornado",
    }
    res_inv = client.post("/shock", json=invalid_shock)
    assert res_inv.status_code == 422


def test_replay_log_endpoint():
    """GET /replay/log must return a deterministic array of SimulatorEvents."""
    res = client.get("/replay/log?seed=42&n_offers=5&vehicle=moto")
    assert res.status_code == 200
    data = res.json()

    assert data["seed"] == 42
    assert "events" in data
    events = data["events"]
    assert len(events) >= 5

    event_names = [e["event"] for e in events]
    assert "shift_start" in event_names
    assert "order_offered" in event_names
    assert "decision" in event_names
