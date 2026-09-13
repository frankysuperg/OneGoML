"""
Motor de decisión del repartidor (Courier Decision Engine).
Evalúa las ofertas de viaje recibidas en tiempo real combinando
las predicciones del modelo ML con un salario de reserva dinámico.
"""
from __future__ import annotations
from typing import Any, Dict

from onego.models.ml_models import DeliveryMLModel, MLPrediction


def calculate_dynamic_reservation_wage(
    base_wage_hr: float,
    order_event: Dict[str, Any]
) -> float:
    """
    Calcula el salario de reserva efectivo en MXN/hora ajustado dinámicamente 
    según factores de riesgo y oportunidad en la Zona Metropolitana de Monterrey.
    """
    multiplier = 1.0
    
    # 1. Si la orden es en zona de montaña o cruza municipios, exige mayor retribución
    if order_event.get("is_mountain_zone", 0):
        multiplier += 0.15  # +15% por desgaste de vehículo y esfuerzo
    if order_event.get("is_cross_municipality", 0):
        multiplier += 0.10  # +10% por mayor tiempo en semáforos/vías rápidas
        
    # 2. Si hay lluvia o condiciones meteorológicas adversas
    weather = order_event.get("weather_severity", 0)
    if weather > 0:
        multiplier += 0.10 * weather
        
    # 3. Si hay tarifa dinámica (surge), se ajusta la expectativa de mercado
    surge = order_event.get("surge_multiplier", 1.0)
    if surge > 1.0:
        multiplier += 0.05 * (surge - 1.0)

    return base_wage_hr * multiplier


def decide_order(
    order_event: Dict[str, Any],
    model: DeliveryMLModel,
    base_reservation_wage_hr: float = 95.0
) -> Dict[str, Any]:
    """
    Toma la decisión de aceptar o rechazar una orden ofrecida.
    
    Args:
        order_event: Diccionario con la información del evento 'order_offered'.
        model: Instancia del DeliveryMLModel cargado.
        base_reservation_wage_hr: Salario de reserva base en MXN por hora.
        
    Returns:
        Diccionario con el evento de respuesta 'decision'.
    """
    # 1. Obtener predicción del modelo ML (incluye Circuit Breaker interno)
    prediction: MLPrediction = model.predict(order_event)

    # 2. Calcular el salario de reserva dinámico ajustado
    effective_wage_hr = calculate_dynamic_reservation_wage(
        base_wage_hr=base_reservation_wage_hr,
        order_event=order_event
    )
    
    # Convertir salario requerido de MXN/hora a MXN/minuto
    required_epm = effective_wage_hr / 60.0

    # 3. Regla de Decisión: Aceptar si la ganancia proyectada/min supera el requerido
    is_accepted = prediction.projected_earnings_per_min >= required_epm

    # 4. Construir el motivo explicativo (Reasoning / Thought Process)
    if prediction.is_degraded:
        reasoning = f"Circuit Breaker (Fallback): {prediction.fallback_reason}"
    else:
        status_str = "aceptada" if is_accepted else "rechazada"
        reasoning = (
            f"Orden {status_str}. Ganancia proyectada: ${prediction.projected_earnings_per_min:.2f} MXN/min "
            f"vs requerida: ${required_epm:.2f} MXN/min (Basado en ${effective_wage_hr:.1f} MXN/hr)."
        )

    # 5. Generar evento de decisión formal
    return {
        "event_type": "decision",
        "event_id": f"dec_{order_event.get('event_id', '000')}",
        "order_id": order_event.get("event_id"),
        "decision": "accept" if is_accepted else "reject",
        "estimated_time_minutes": prediction.estimated_time_minutes,
        "projected_earnings_per_min": prediction.projected_earnings_per_min,
        "ml_confidence_score": prediction.ml_confidence_score,
        "degraded": prediction.is_degraded,  # Pasa directo al frontend React
        "reasoning": reasoning
    }


if __name__ == "__main__":
    # Prueba rápida del motor de decisión
    ml_model = DeliveryMLModel()
    ml_model.train()  # Carga o entrena modelo

    sample_order = {
        "event_id": "ord_999",
        "distance_km": 8.5,
        "base_pay": 90.0,
        "tip": 20.0,
        "surge_multiplier": 1.2,
        "hour_of_day": 18,
        "traffic_level": 2,
        "weather_severity": 1,
        "pickup_zone": "Centro MTY",
        "dropoff_zone": "San Pedro",
        "is_cross_municipality": 1,
        "is_mountain_zone": 0,
        "gonzalitos_bottle_neck": 1
    }

    result = decide_order(sample_order, ml_model)
    print("--- Resultado de Decisión ---")
    print(f"Decisión: {result['decision'].upper()}")
    print(f"Degraded: {result['degraded']}")
    print(f"Razonamiento: {result['reasoning']}")