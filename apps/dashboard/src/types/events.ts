/**
 * Types mirrored from courier/event_log_schema.json (read-only source of truth).
 * Required vs optional follows each event's `required` array; extra fields from
 * `fields` / `_illustrative` are optional.
 */

export type Vehicle = 'moto' | 'car' | 'bike'

export type Platform = 'rappi' | 'didi' | 'uber'

export type CourierStatus =
  | 'idle'
  | 'to_pickup'
  | 'waiting'
  | 'to_dropoff'
  | 'on_break'

export type ShockType = 'surge' | 'closure' | 'rain' | 'delay'

export type DecisionOutcome = 'ACCEPT' | 'SKIP'

export type BindingConstraint =
  | 'flagged_zone_night'
  | 'mandatory_break'
  | 'heat_rule'
  | 'shift_end_infeasible'
  | 'vehicle_capacity'
  | 'reservation_wage'
  | null

export type DecisionTier = 'tier1' | 'tier2'

export interface ShiftStartEvent {
  event: 'shift_start'
  sim_time: string
  seed: number
  shift_hours: number
  vehicle: Vehicle
  start_location_zone: number
  shift_end_time: string
  fuel_mxn_per_km?: number
}

export interface OrderOfferedEvent {
  event: 'order_offered'
  order_id: string
  sim_time: string
  zone_pickup: number
  zone_dropoff: number
  distance_pickup_km: number
  distance_delivery_km: number
  base_pay_mxn: number
  surge_multiplier: number
  vehicle: Vehicle
  platform?: Platform
  decision_deadline?: string
  zone_pickup_name?: string
  zone_dropoff_name?: string
  est_tip_mxn?: number
  restaurant_prep_min?: number
  weight_kg?: number
  volume_liters?: number
  estimated_pickup_min?: number
  estimated_delivery_min?: number
}

export interface DecisionEconomics {
  net_pay_mxn?: number
  total_time_min?: number
  raw_rate_mxn_hr?: number
  adjusted_rate_mxn_hr?: number
  reservation_wage_mxn_hr?: number
  deadhead_km?: number
}

/** Mirrors /decide response; logged as event_log `decision`. */
export interface DecisionEvent {
  event: 'decision'
  order_id: string
  sim_time: string
  decision: DecisionOutcome
  reason: string
  latency_ms: number
  binding_constraint?: BindingConstraint
  tier?: DecisionTier
  degraded?: boolean
  economics?: DecisionEconomics
}

export interface PositionUpdateEvent {
  event: 'position_update'
  sim_time: string
  zone: number
  status: CourierStatus
}

export interface EarningsUpdateEvent {
  event: 'earnings_update'
  sim_time: string
  earnings_mxn: number
  orders_completed: number
  mxn_per_hr?: number
}

export interface ShockEvent {
  event: 'shock'
  sim_time: string
  shock_type: ShockType
  zone?: number
  multiplier?: number
  road?: string
  order_id?: string
  slip_min?: number
  duration_min?: number
}

export interface StrategyUpdateEvent {
  event: 'strategy_update'
  sim_time: string
  reservation_wage_mxn_hr: number
  target_zone?: number
  reasoning?: string
  confidence?: string
  degraded?: boolean
}

export interface ShiftEndEvent {
  event: 'shift_end'
  sim_time: string
  orders_offered?: number
  orders_completed?: number
  earnings_mxn?: number
  safety_violations?: number
}

export type SimulatorEvent =
  | ShiftStartEvent
  | OrderOfferedEvent
  | DecisionEvent
  | PositionUpdateEvent
  | EarningsUpdateEvent
  | ShockEvent
  | StrategyUpdateEvent
  | ShiftEndEvent
