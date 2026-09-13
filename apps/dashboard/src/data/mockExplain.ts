import type { ExplainDecisionResponse } from '../types'

export const MOCK_EXPLAIN_OUR: ExplainDecisionResponse = {
  order_id: 'ORD-0001',
  decision: 'ACCEPT',
  reason: 'Adjusted rate 192 MXN/hr clears reservation wage; capacity ok.',
  inputs: {
    position_zone: 7,
    time_remaining_min: 250,
    time_to_completion_min: 22,
    continuous_riding_min: 48,
    in_flight_orders: [],
    strategy: {
      reservation_wage_mxn_hr: 185,
      target_zone: 11,
      degraded: false,
    },
    economics: {
      net_pay_mxn: 64.2,
      adjusted_rate_mxn_hr: 192,
      deadhead_km: 1.4,
    },
  },
  alternatives_considered: [
    {
      option: 'SKIP and wait for higher surge in z11',
      rejected_because:
        'Expected wait exceeded residual value vs clearing reservation wage now.',
    },
    {
      option: 'ACCEPT only if tip >= 20',
      rejected_because:
        'Pay criteria already cleared without requiring a higher tip gate.',
    },
  ],
  ai_explanation: {
    order_id: 'ORD-0001',
    provider: 'local-expert-ai',
    model_name: 'OneGoML-Decision-Interpreter-v2',
    verdict_category: 'ACEPTADA_ALTA_RENTABILIDAD',
    decision: 'ACCEPT',
    executive_summary:
      'Pedido aprobado con excelente rentabilidad neta de $64.2 MXN. La tarifa efectiva ajustada ($192 MXN/h) supera con holgura el salario de reserva dinámico ($185 MXN/h). Todas las compuertas de seguridad fueron superadas satisfactoriamente.',
    confidence_score: 0.96,
    financial_breakdown: {
      gross_pay_mxn: 70.5,
      estimated_fuel_cost_mxn: 6.3,
      net_pay_mxn: 64.2,
      deadhead_km: 1.4,
      delivery_km: 4.2,
      deadhead_ratio_pct: 25.0,
      projected_rate_mxn_hr: 192.0,
      reservation_wage_mxn_hr: 185.0,
      rate_delta_mxn_hr: 7.0,
    },
    safety_breakdown: {
      passed_all_gates: true,
      binding_constraint: null,
      weight_kg: 3.2,
      weight_limit_kg: 15.0,
      weather_level: 0,
      traffic_level: 1,
      zone_risk: 0,
    },
    geospatial_tactics: {
      pickup_zone: 'San Pedro',
      dropoff_zone: 'Centro MTY',
      relocation_quality: 'ALTA',
      zone_evaluation:
        'Centro MTY es un núcleo de alta demanda con constante generación de ofertas.',
      tactical_analysis:
        'La entrega desde San Pedro hacia Centro MTY (4.2 km) mantiene al repartidor dentro del corredor principal de alta demanda. El trayecto de recolección fue eficiente (1.4 km, 25.0% de deadhead).',
    },
    courier_recommendation:
      'Aceptar de inmediato. Al finalizar la entrega en Centro MTY, posicionarse cerca de puntos comerciales para capturar el siguiente pedido con baja distancia en vacío.',
  },
}

/** Historical decision — not the current order, for timeline open. */
export const MOCK_EXPLAIN_PAST: ExplainDecisionResponse = {
  order_id: 'ORD-0098',
  decision: 'SKIP',
  reason: 'Heat rule bound after 95 min continuous riding without a break.',
  inputs: {
    position_zone: 9,
    time_remaining_min: 310,
    continuous_riding_min: 95,
    in_flight_orders: [],
    strategy: {
      reservation_wage_mxn_hr: 185,
      heat_rule_max_min: 90,
      degraded: false,
    },
  },
  alternatives_considered: [
    {
      option: 'ACCEPT and break after dropoff',
      rejected_because: 'Heat rule is a hard gate; cannot accept while over limit.',
    },
  ],
  ai_explanation: {
    order_id: 'ORD-0098',
    provider: 'local-expert-ai',
    model_name: 'OneGoML-Decision-Interpreter-v2',
    verdict_category: 'RECHAZADA_RESTRICCION_SEGURIDAD',
    decision: 'SKIP',
    executive_summary:
      'Pedido rechazado por activación obligatoria de la regla de fatiga y calor (Heat Rule). El repartidor acumula 95 minutos continuos de conducción sin pausa, excediendo el límite de seguridad (90 min).',
    confidence_score: 0.98,
    financial_breakdown: {
      gross_pay_mxn: 52.0,
      estimated_fuel_cost_mxn: 8.1,
      net_pay_mxn: 43.9,
      deadhead_km: 1.8,
      delivery_km: 3.6,
      deadhead_ratio_pct: 33.3,
      projected_rate_mxn_hr: 175.0,
      reservation_wage_mxn_hr: 185.0,
      rate_delta_mxn_hr: -10.0,
    },
    safety_breakdown: {
      passed_all_gates: false,
      binding_constraint: 'heat_rule',
      weight_kg: 4.0,
      weight_limit_kg: 15.0,
      weather_level: 2,
      traffic_level: 2,
      zone_risk: 0,
    },
    geospatial_tactics: {
      pickup_zone: 'Tec / San Rafael',
      dropoff_zone: 'Valle Oriente',
      relocation_quality: 'ALTA',
      zone_evaluation:
        'Valle Oriente tiene buena demanda, pero el riesgo fisiológico invalida el viaje.',
      tactical_analysis:
        'Conducir con fatiga térmica incrementa un 45% la probabilidad de incidentes viales.',
    },
    courier_recommendation:
      'Tomar un descanso obligatorio de 15 minutos en un área con sombra o aire acondicionado antes de aceptar nuevas órdenes.',
  },
}

export const MOCK_EXPLAIN_BASELINE: ExplainDecisionResponse = {
  order_id: 'ORD-0002',
  decision: 'SKIP',
  reason: 'Package exceeds bike bag volume after in-flight stack.',
  inputs: {
    position_zone: 5,
    time_remaining_min: 180,
    vehicle: 'bike',
    capacity_liters: 12,
    used_liters: 10,
    order_volume_liters: 3.5,
    in_flight_orders: ['ORD-0090'],
    strategy: {
      reservation_wage_mxn_hr: 160,
      degraded: true,
    },
  },
  alternatives_considered: [
    {
      option: 'ACCEPT ignoring volume headroom',
      rejected_because: 'Hard safety gate vehicle_capacity must bind in code.',
    },
    {
      option: 'Defer decision until model recovers',
      rejected_because:
        'Fast path must answer within budget; degraded strategy still decides.',
    },
  ],
  ai_explanation: {
    order_id: 'ORD-0002',
    provider: 'local-expert-ai',
    model_name: 'OneGoML-Decision-Interpreter-v2',
    verdict_category: 'RECHAZADA_CAPACIDAD_EXCEDIDA',
    decision: 'SKIP',
    executive_summary:
      'Pedido rechazado por sobrevolumen y peso para bicicleta. El volumen total requerido (13.5 L) excede la capacidad máxima de la mochila de reparto (12 L).',
    confidence_score: 0.95,
    financial_breakdown: {
      gross_pay_mxn: 38.0,
      estimated_fuel_cost_mxn: 0.0,
      net_pay_mxn: 38.0,
      deadhead_km: 0.8,
      delivery_km: 2.1,
      deadhead_ratio_pct: 27.6,
      projected_rate_mxn_hr: 155.0,
      reservation_wage_mxn_hr: 160.0,
      rate_delta_mxn_hr: -5.0,
    },
    safety_breakdown: {
      passed_all_gates: false,
      binding_constraint: 'vehicle_capacity',
      weight_kg: 9.5,
      weight_limit_kg: 8.0,
      weather_level: 0,
      traffic_level: 1,
      zone_risk: 0,
    },
    geospatial_tactics: {
      pickup_zone: 'Valle Oriente',
      dropoff_zone: 'San Pedro',
      relocation_quality: 'ALTA',
      zone_evaluation:
        'San Pedro es óptima pero el paquete físico no cabe de forma segura en la mochila.',
      tactical_analysis:
        'El transporte forzado de volumen excesivo compromete la estabilidad en bicicleta.',
    },
    courier_recommendation:
      'Rechazo preventivo correcto. Esperar un pedido de menor volumen (<3 L) compatible con la mochila térmica de bicicleta.',
  },
}

export const MOCK_EXPLANATIONS: Record<string, ExplainDecisionResponse> = {
  [MOCK_EXPLAIN_PAST.order_id]: MOCK_EXPLAIN_PAST,
  [MOCK_EXPLAIN_OUR.order_id]: MOCK_EXPLAIN_OUR,
  [MOCK_EXPLAIN_BASELINE.order_id]: MOCK_EXPLAIN_BASELINE,
}
