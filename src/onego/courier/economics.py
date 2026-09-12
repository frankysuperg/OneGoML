"""
Evaluación económica con perfiles distintos por tipo de vehículo.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any

@dataclass
class EconomicEvaluation:
    gross_revenue: float
    fuel_cost: float
    net_revenue: float
    earnings_per_min: float
    final_score: float
    recommendation: str

VEHICLE_PROFILES = {
    "bike": {"speed_factor": 0.8, "fuel_per_km": 0.0, "capacity_kg": 10},
    "moto": {"speed_factor": 1.0, "fuel_per_km": 4.5, "capacity_kg": 15},
    "car":  {"speed_factor": 1.2, "fuel_per_km": 8.0, "capacity_kg": 50},
}

class EconomicsEngine:
    def __init__(self, baseline_epm: float = 6.0):
        self.baseline_epm = baseline_epm

    def evaluate(self, order: dict[str, Any], ml_prediction: Any, vehicle_type: str = "moto") -> EconomicEvaluation:
        profile = VEHICLE_PROFILES.get(vehicle_type, VEHICLE_PROFILES["moto"])
        base_pay, tip, surge = float(order.get("base_pay", 0)), float(order.get("tip", 0)), float(order.get("surge_multiplier", 1.0))
        distance = float(order.get("distance_km", 0))
        
        gross = base_pay * surge + tip
        fuel = distance * profile["fuel_per_km"]
        net = gross - fuel
        
        est_time = max(ml_prediction.estimated_time_minutes, 1.0)
        epm = net / est_time
        
        # Score: bonificación por confianza ML, penalización si está por debajo del baseline
        final_score = (epm - self.baseline_epm) + (ml_prediction.ml_confidence_score * 3.0)
        
        if final_score >= 3.0 and ml_prediction.ml_confidence_score >= 0.6:
            rec = "STRONG_ACCEPT"
        elif final_score >= 0.5:
            rec = "ACCEPT"
        elif final_score >= -1.0:
            rec = "MARGINAL"
        else:
            rec = "REJECT"
            
        return EconomicEvaluation(gross_revenue=round(gross, 2), fuel_cost=round(fuel, 2),
                                  net_revenue=round(net, 2), earnings_per_min=round(epm, 2),
                                  final_score=round(final_score, 2), recommendation=rec)
