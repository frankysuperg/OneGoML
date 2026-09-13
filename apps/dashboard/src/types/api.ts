/**
 * Types mirrored from courier/decision_response_schema.json
 * (decide_response, explain_decision_response, decide_request shape).
 */

import type {
  BindingConstraint,
  DecisionEconomics,
  DecisionOutcome,
  DecisionTier,
  OrderOfferedEvent,
  Vehicle,
  Platform,
} from './events'

export interface CourierStateOverrides {
  continuous_riding_min?: number
  shift_elapsed_hours?: number
  last_break_end_time?: string | null
  shift_end_time?: string
  in_flight_orders?: unknown[]
}

/** POST /decide body — order_offered fields without `event`, plus overrides. */
export type DecideRequest = Omit<OrderOfferedEvent, 'event'> & {
  courier_state_overrides?: CourierStateOverrides
  platform?: Platform
  vehicle: Vehicle
}

export interface DecideResponse {
  order_id: string
  decision: DecisionOutcome
  reason: string
  latency_ms: number
  binding_constraint?: BindingConstraint
  tier?: DecisionTier
  degraded?: boolean
  economics?: DecisionEconomics
}

export interface ExplainAlternative {
  option: string
  rejected_because: string
}

export interface AIFinancialBreakdown {
  gross_pay_mxn: number
  estimated_fuel_cost_mxn: number
  net_pay_mxn: number
  deadhead_km: number
  delivery_km: number
  deadhead_ratio_pct: number
  projected_rate_mxn_hr: number
  reservation_wage_mxn_hr: number
  rate_delta_mxn_hr: number
}

export interface AISafetyBreakdown {
  passed_all_gates: boolean
  binding_constraint: string | null
  weight_kg: number
  weight_limit_kg: number
  weather_level: number
  traffic_level: number
  zone_risk: number
}

export interface AIGeospatialTactics {
  pickup_zone: string
  dropoff_zone: string
  relocation_quality: string
  zone_evaluation: string
  tactical_analysis: string
}

export interface AIDecisionExplanation {
  order_id: string
  provider: 'local-expert-ai' | 'gemini' | string
  model_name: string
  verdict_category: string
  decision: DecisionOutcome
  executive_summary: string
  confidence_score: number
  financial_breakdown: AIFinancialBreakdown
  safety_breakdown: AISafetyBreakdown
  geospatial_tactics: AIGeospatialTactics
  courier_recommendation: string
}

export interface ExplainDecisionResponse {
  order_id: string
  decision: DecisionOutcome
  reason: string
  /** Full numeric state at decision time (schema: unstructured object). */
  inputs: Record<string, unknown>
  alternatives_considered: ExplainAlternative[]
  ai_explanation?: AIDecisionExplanation
}
