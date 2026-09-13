"""
Motor de decisión del repartidor con evaluación de incertidumbre.

Public API
----------
CourierDecider  — class used by demo_live.py, tests, and the API server.
                  Produces responses matching decision_response_schema.json.
decide_order    — lower-level function (kept for backward compatibility).
"""
from __future__ import annotations

# Re-export the class so `from onego.courier.decide import CourierDecider` works.
from onego.courier.courier_decider import CourierDecider  # noqa: F401

from typing import Any, Dict

from onego.models.ml_models import DeliveryMLModel, MLPrediction


def calculate_dynamic_reservation_wage(
    base_wage_hr: float,
    order_event: Dict[str, Any]
) -> float:
    multiplier = 1.0
    if order_event.get("is_mountain_zone", 0):
        multiplier += 0.15
    if order_event.get("is_cross_municipality", 0):
        multiplier += 0.10
        
    weather = order_event.get("weather_severity", 0)
    if weather > 0:
        multiplier += 0.10 * weather
        
    surge = order_event.get("surge_multiplier", 1.0)
    if surge > 1.0:
        multiplier += 0.05 * (surge - 1.0)

    return base_wage_hr * multiplier


def decide_order(
    order_event: Dict[str, Any],
    model: DeliveryMLModel,
    base_reservation_wage_hr: float = 95.0,
    risk_tolerance: str = "moderate"  # "conservative", "moderate", "aggressive"
) -> Dict[str, Any]:
    prediction: MLPrediction = model.predict(order_event)

    effective_wage_hr = calculate_dynamic_reservation_wage(
        base_wage_hr=base_reservation_wage_hr,
        order_event=order_event
    )
    required_epm = effective_wage_hr / 60.0

    # Decisión según tolerancia al riesgo
    if risk_tolerance == "conservative":
        # Valida contra el EPM pesimista (peor escenario del intervalo de tiempo)
        eval_epm = prediction.pessimistic_epm
    elif risk_tolerance == "moderate" and prediction.uncertainty_range_minutes > 12.0:
        # Si la incertidumbre es mayor a 12 min, castiga evaluando con el pesimista
        eval_epm = prediction.pessimistic_epm
    else:
        # Evaluación normal sobre valor esperado
        eval_epm = prediction.projected_earnings_per_min

    is_accepted = eval_epm >= required_epm

    if prediction.is_degraded:
        reasoning = f"Circuit Breaker (Fallback): {prediction.fallback_reason}"
    else:
        status_str = "aceptada" if is_accepted else "rechazada"
        reasoning = (
            f"Orden {status_str}. Tiempo est: {prediction.estimated_time_minutes}m "
            f"[{prediction.time_lower_bound}m - {prediction.time_upper_bound}m] "
            f"(±{prediction.uncertainty_range_minutes}m incertidumbre). "
            f"EPM eval: ${eval_epm:.2f} MXN/min vs req: ${required_epm:.2f} MXN/min."
        )

    return {
        "event_type": "decision",
        "event_id": f"dec_{order_event.get('event_id', '000')}",
        "order_id": order_event.get("event_id"),
        "decision": "accept" if is_accepted else "reject",
        "estimated_time_minutes": prediction.estimated_time_minutes,
        "time_lower_bound": prediction.time_lower_bound,
        "time_upper_bound": prediction.time_upper_bound,
        "uncertainty_range_minutes": prediction.uncertainty_range_minutes,
        "projected_earnings_per_min": prediction.projected_earnings_per_min,
        "pessimistic_epm": prediction.pessimistic_epm,
        "ml_confidence_score": prediction.ml_confidence_score,
        "degraded": prediction.is_degraded,
        "reasoning": reasoning
    }


make_decision = decide_order  # Alias de compatibilidad


if __name__ == "__main__":
    ml_model = DeliveryMLModel()
    ml_model.train(force=True)

    sample_order = {
        "event_id": "ord_999",
        "distance_km": 12.0,
        "base_pay": 110.0,
        "tip": 15.0,
        "surge_multiplier": 1.0,
        "hour_of_day": 18,
        "traffic_level": 3,
        "weather_severity": 2,
        "is_cross_municipality": 1,
        "is_mountain_zone": 1
    }

    result = decide_order(sample_order, ml_model)
    print("--- Resultado con Intervalos de Confianza ---")
    print(f"Decisión: {result['decision'].upper()}")
    print(f"Rango de Tiempo: {result['time_lower_bound']} min - {result['time_upper_bound']} min")
    print(f"Incertidumbre: ±{result['uncertainty_range_minutes']} min")
    print(f"EPM Esperado: ${result['projected_earnings_per_min']} /min | EPM Pesimista: ${result['pessimistic_epm']} /min")
    print(f"Razonamiento: {result['reasoning']}")