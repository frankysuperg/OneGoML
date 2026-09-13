import { AgentPanel, type AgentViewModel } from './components/AgentPanel'
import { AppShell } from './components/AppShell'
import type {
  DecideResponse,
  ExplainDecisionResponse,
  OrderOffered,
} from './types'

const MOCK_ORDER_OUR: OrderOffered = {
  event: 'order_offered',
  order_id: 'ORD-0001',
  platform: 'rappi',
  sim_time: '2026-03-21T18:42:00',
  decision_deadline: '2026-03-21T18:42:05',
  zone_pickup: 7,
  zone_dropoff: 11,
  zone_pickup_name: 'San Pedro',
  zone_dropoff_name: 'Centro',
  distance_pickup_km: 1.4,
  distance_delivery_km: 6.5,
  base_pay_mxn: 58.0,
  est_tip_mxn: 12.0,
  surge_multiplier: 1.3,
  restaurant_prep_min: 9,
  weight_kg: 2.1,
  volume_liters: 6.0,
  vehicle: 'moto',
  estimated_pickup_min: 4,
  estimated_delivery_min: 18,
}

const MOCK_DECISION_OUR: DecideResponse = {
  order_id: 'ORD-0001',
  decision: 'ACCEPT',
  reason: 'Adjusted rate 192 MXN/hr clears reservation wage; capacity ok.',
  binding_constraint: null,
  latency_ms: 6,
  tier: 'tier1',
  degraded: false,
}

const MOCK_EXPLAIN_OUR: ExplainDecisionResponse = {
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

const MOCK_ORDER_BASELINE: OrderOffered = {
  event: 'order_offered',
  order_id: 'ORD-0002',
  platform: 'didi',
  sim_time: '2026-03-21T19:07:00',
  decision_deadline: '2026-03-21T19:07:05',
  zone_pickup: 5,
  zone_dropoff: 5,
  zone_pickup_name: 'Valle Oriente',
  zone_dropoff_name: 'Valle Oriente',
  distance_pickup_km: 0.6,
  distance_delivery_km: 1.8,
  base_pay_mxn: 41.0,
  est_tip_mxn: 4.0,
  surge_multiplier: 1.0,
  restaurant_prep_min: 5,
  weight_kg: 1.0,
  volume_liters: 3.5,
  vehicle: 'moto',
  estimated_pickup_min: 2,
  estimated_delivery_min: 8,
}

const MOCK_DECISION_BASELINE: DecideResponse = {
  order_id: 'ORD-0002',
  decision: 'SKIP',
  reason: 'Package exceeds bike bag volume after in-flight stack.',
  binding_constraint: 'vehicle_capacity',
  latency_ms: 3,
  tier: 'tier1',
  degraded: false,
}

const MOCK_EXPLAIN_BASELINE: ExplainDecisionResponse = {
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

const MOCK_OUR_AGENT: AgentViewModel = {
  name: 'OurAgent',
  strategyType: 'Reservation wage + safety gates',
  status: 'to_dropoff',
  degraded: false,
  currentZoneId: 11,
  pickupZoneId: 7,
  dropoffZoneId: 11,
  currentOrder: MOCK_ORDER_OUR,
  lastDecision: MOCK_DECISION_OUR,
  explanationsByOrderId: {
    [MOCK_EXPLAIN_OUR.order_id]: MOCK_EXPLAIN_OUR,
  },
}

const MOCK_BASELINE: AgentViewModel = {
  name: 'GreedyRate',
  strategyType: 'Baseline · highest instantaneous $/hr',
  status: 'to_pickup',
  degraded: true,
  currentZoneId: 5,
  pickupZoneId: 5,
  dropoffZoneId: 9,
  currentOrder: MOCK_ORDER_BASELINE,
  lastDecision: MOCK_DECISION_BASELINE,
  explanationsByOrderId: {
    [MOCK_EXPLAIN_BASELINE.order_id]: MOCK_EXPLAIN_BASELINE,
  },
}

function App() {
  return (
    <AppShell>
      <div className="flex h-[calc(100vh-3.5rem)] gap-3 p-3">
        <AgentPanel agent={MOCK_OUR_AGENT} />
        <AgentPanel agent={MOCK_BASELINE} />
      </div>
    </AppShell>
  )
}

export default App
