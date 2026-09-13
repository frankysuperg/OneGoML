import { useEffect, useMemo, useState } from 'react'
import { AgentPanel, type AgentViewModel } from './components/AgentPanel'
import { AgentsComparisonBar } from './components/AgentsComparisonBar'
import { AppShell } from './components/AppShell'
import { EventTimeline } from './components/EventTimeline'
import { ShiftEndSummary } from './components/ShiftEndSummary'
import { ShockTriggerControl } from './components/ShockTriggerControl'
import { SimulationControls } from './components/SimulationControls'
import {
  MOCK_EXPLAIN_BASELINE,
  MOCK_EXPLAIN_OUR,
  MOCK_EXPLAIN_PAST,
} from './data/mockExplain'
import { shockLabel } from './data/mockTimeline'
import { useShiftStore } from './store/shiftStore'
import type { ActiveShock } from './store/types'
import type { DecideResponse, OrderOffered } from './types'

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
    [MOCK_EXPLAIN_PAST.order_id]: MOCK_EXPLAIN_PAST,
    [MOCK_EXPLAIN_OUR.order_id]: MOCK_EXPLAIN_OUR,
  },
  economics: {
    earningsMxn: 842,
    ordersCompleted: 9,
    mxnPerHour: 191,
    ordersAccepted: 12,
    ordersRejected: 6,
    distanceKm: 47.2,
    safetyViolations: 0,
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
  economics: {
    earningsMxn: 618,
    ordersCompleted: 11,
    mxnPerHour: 140,
    ordersAccepted: 18,
    ordersRejected: 2,
    distanceKm: 61.0,
    safetyViolations: 2,
  },
}

const TICK_HOURS_ELAPSED = 4.4

function App() {
  const status = useShiftStore((s) => s.status)
  const log = useShiftStore((s) => s.events)
  const [ourAgent, setOurAgent] = useState(MOCK_OUR_AGENT)
  const [baseline, setBaseline] = useState(MOCK_BASELINE)

  const shocksFaced = useMemo<ActiveShock[]>(() => {
    const seen = new Set<string>()
    const out: ActiveShock[] = []
    for (const entry of log) {
      if (entry.payload.event !== 'shock') continue
      const label = shockLabel(entry.payload)
      if (seen.has(label)) continue
      seen.add(label)
      out.push({
        shock_type: entry.payload.shock_type,
        zone: entry.payload.zone,
        label,
      })
    }
    return out
  }, [log])

  useEffect(() => {
    if (status !== 'Running') return
    const id = window.setInterval(() => {
      setOurAgent((prev) => {
        const earningsMxn = prev.economics.earningsMxn + 2.4
        return {
          ...prev,
          economics: {
            ...prev.economics,
            earningsMxn,
            mxnPerHour: earningsMxn / TICK_HOURS_ELAPSED,
          },
        }
      })
      setBaseline((prev) => {
        const earningsMxn = prev.economics.earningsMxn + 1.1
        return {
          ...prev,
          economics: {
            ...prev.economics,
            earningsMxn,
            mxnPerHour: earningsMxn / TICK_HOURS_ELAPSED,
          },
        }
      })
    }, 2200)
    return () => window.clearInterval(id)
  }, [status])

  const agents = [ourAgent, baseline]

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        <AgentsComparisonBar agents={agents} />
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 py-2">
          <SimulationControls />
          <ShockTriggerControl />
        </div>
        <div className="flex min-h-0 flex-1 gap-3 p-3">
          <AgentPanel agent={ourAgent} />
          <AgentPanel agent={baseline} />
          <EventTimeline />
        </div>
      </div>
      <ShiftEndSummary agents={agents} shocksFaced={shocksFaced} />
    </AppShell>
  )
}

export default App
