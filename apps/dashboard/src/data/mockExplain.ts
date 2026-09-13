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
}

export const MOCK_EXPLANATIONS: Record<string, ExplainDecisionResponse> = {
  [MOCK_EXPLAIN_PAST.order_id]: MOCK_EXPLAIN_PAST,
  [MOCK_EXPLAIN_OUR.order_id]: MOCK_EXPLAIN_OUR,
  [MOCK_EXPLAIN_BASELINE.order_id]: MOCK_EXPLAIN_BASELINE,
}
