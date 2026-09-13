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

export interface ExplainDecisionResponse {
  order_id: string
  decision: DecisionOutcome
  reason: string
  /** Full numeric state at decision time (schema: unstructured object). */
  inputs: Record<string, unknown>
  alternatives_considered: ExplainAlternative[]
}
