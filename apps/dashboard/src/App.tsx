import { useEffect, useMemo, useRef, useState } from 'react'
import { AgentPanel, type AgentViewModel } from './components/AgentPanel'
import { AgentsComparisonBar } from './components/AgentsComparisonBar'
import { AppShell } from './components/AppShell'
import { EventTimeline } from './components/EventTimeline'
import { ReplayControls } from './components/ReplayControls'
import { ShiftEndSummary } from './components/ShiftEndSummary'
import { ShockTriggerControl } from './components/ShockTriggerControl'
import { SimulationControls } from './components/SimulationControls'
import {
  MOCK_EXPLAIN_BASELINE,
  MOCK_EXPLAIN_OUR,
  MOCK_EXPLAIN_PAST,
} from './data/mockExplain'
import { MOCK_REPLAY_LOG } from './data/mockReplayLog'
import { shockLabel } from './data/mockTimeline'
import { fetchReplayLogApi } from './data/eventStream'
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

function App() {
  const status = useShiftStore((s) => s.status)
  const log = useShiftStore((s) => s.events)
  const enterReplay = useShiftStore((s) => s.enterReplay)
  const syncStatus = useShiftStore((s) => s.syncStatus)
  const [ourAgent, setOurAgent] = useState(MOCK_OUR_AGENT)
  const [baseline, setBaseline] = useState(MOCK_BASELINE)

  const isReplay = status === 'Replay'
  const liveAgentsRef = useRef<{ our: AgentViewModel; base: AgentViewModel } | null>(null)

  // When exiting replay mode, restore live agent states exactly as they were
  useEffect(() => {
    if (status !== 'Replay' && liveAgentsRef.current) {
      setOurAgent(liveAgentsRef.current.our)
      setBaseline(liveAgentsRef.current.base)
      liveAgentsRef.current = null
    }
  }, [status])

  // Periodically sync backend status
  useEffect(() => {
    syncStatus()
    const id = window.setInterval(syncStatus, 5000)
    return () => window.clearInterval(id)
  }, [syncStatus])

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

  // Reactively synchronize agents with latest events from backend / store
  useEffect(() => {
    if (log.length === 0) return
    const top = log[0]?.payload
    if (!top) return

    if (top.event === 'shift_start') {
      const startZone = (top as unknown as { start_location_zone?: number }).start_location_zone ?? 7
      const zeroEcon = {
        earningsMxn: 0,
        ordersCompleted: 0,
        mxnPerHour: 0,
        ordersAccepted: 0,
        ordersRejected: 0,
        distanceKm: 0,
        safetyViolations: 0,
      }
      setOurAgent((prev) => ({
        ...prev,
        status: 'idle',
        currentZoneId: startZone,
        pickupZoneId: undefined,
        dropoffZoneId: undefined,
        currentOrder: undefined,
        lastDecision: undefined,
        economics: zeroEcon,
      }))
      setBaseline((prev) => ({
        ...prev,
        status: 'idle',
        currentZoneId: startZone,
        pickupZoneId: undefined,
        dropoffZoneId: undefined,
        currentOrder: undefined,
        lastDecision: undefined,
        economics: zeroEcon,
      }))
    } else if (top.event === 'order_offered') {
      setOurAgent((prev) => ({
        ...prev,
        currentOrder: top,
        pickupZoneId: top.zone_pickup,
        dropoffZoneId: top.zone_dropoff,
      }))
      setBaseline((prev) => ({
        ...prev,
        currentOrder: top,
        pickupZoneId: top.zone_pickup,
        dropoffZoneId: top.zone_dropoff,
      }))
    } else if (top.event === 'decision') {
      const isAccept = top.decision === 'ACCEPT'
      setOurAgent((prev) => {
        const accepted = prev.economics.ordersAccepted + (isAccept ? 1 : 0)
        const rejected = prev.economics.ordersRejected + (isAccept ? 0 : 1)
        const distAdd = isAccept
          ? ((prev.currentOrder?.distance_pickup_km ?? 0) + (prev.currentOrder?.distance_delivery_km ?? 0))
          : 0
        return {
          ...prev,
          lastDecision: top,
          status: isAccept ? 'to_pickup' : 'idle',
          economics: {
            ...prev.economics,
            ordersAccepted: accepted,
            ordersRejected: rejected,
            distanceKm: Number((prev.economics.distanceKm + distAdd).toFixed(1)),
          },
        }
      })

      const baseInfo = (top as unknown as { baseline?: Record<string, unknown> }).baseline
      if (baseInfo) {
        const isBaseAccept = baseInfo.decision === 'ACCEPT'
        setBaseline((prev) => {
          const distAdd = isBaseAccept
            ? ((prev.currentOrder?.distance_pickup_km ?? 0) + (prev.currentOrder?.distance_delivery_km ?? 0))
            : 0
          const baseEarn = Number(baseInfo.earnings_mxn ?? prev.economics.earningsMxn)
          const baseComp = Number(baseInfo.orders_completed ?? prev.economics.ordersCompleted)
          const baseRate = baseComp > 0 ? Math.round(baseEarn / Math.max(baseComp * 0.35, 0.5)) : 0
          return {
            ...prev,
            status: isBaseAccept ? 'to_pickup' : 'idle',
            lastDecision: {
              order_id: top.order_id,
              decision: (baseInfo.decision as 'ACCEPT' | 'SKIP') ?? 'ACCEPT',
              reason: (baseInfo.reason as string) ?? 'Greedy rate check',
              latency_ms: 1,
              tier: 'tier1',
              degraded: true,
            },
            economics: {
              ...prev.economics,
              earningsMxn: baseEarn,
              ordersCompleted: baseComp,
              ordersAccepted: Number(baseInfo.orders_accepted ?? prev.economics.ordersAccepted),
              ordersRejected: Number(baseInfo.orders_rejected ?? prev.economics.ordersRejected),
              safetyViolations: Number(baseInfo.safety_violations ?? prev.economics.safetyViolations),
              mxnPerHour: baseRate,
              distanceKm: Number((prev.economics.distanceKm + distAdd).toFixed(1)),
            },
          }
        })
      }
    } else if (top.event === 'position_update') {
      setOurAgent((prev) => ({
        ...prev,
        currentZoneId: top.zone,
        status: top.status,
      }))
      setBaseline((prev) => ({
        ...prev,
        currentZoneId: prev.status !== 'idle' ? top.zone : prev.currentZoneId,
      }))
    } else if (top.event === 'earnings_update') {
      setOurAgent((prev) => ({
        ...prev,
        status: 'idle',
        economics: {
          ...prev.economics,
          earningsMxn: top.earnings_mxn,
          ordersCompleted: top.orders_completed,
          mxnPerHour: top.mxn_per_hr ?? (top.orders_completed > 0 ? Math.round(top.earnings_mxn / Math.max(top.orders_completed * 0.35, 0.5)) : 0),
        },
      }))
      setBaseline((prev) => ({
        ...prev,
        status: 'idle',
      }))
    }
  }, [log])

  const handleEnterReplay = async () => {
    // 1. Snapshot current live agents before entering replay
    liveAgentsRef.current = { our: ourAgent, base: baseline }

    // 2. Reset agents display immediately for clean replay playback
    const zeroEcon = {
      earningsMxn: 0,
      ordersCompleted: 0,
      mxnPerHour: 0,
      ordersAccepted: 0,
      ordersRejected: 0,
      distanceKm: 0,
      safetyViolations: 0,
    }
    setOurAgent((prev) => ({
      ...prev,
      status: 'idle',
      currentZoneId: 7,
      pickupZoneId: undefined,
      dropoffZoneId: undefined,
      currentOrder: undefined,
      lastDecision: undefined,
      economics: zeroEcon,
    }))
    setBaseline((prev) => ({
      ...prev,
      status: 'idle',
      currentZoneId: 7,
      pickupZoneId: undefined,
      dropoffZoneId: undefined,
      currentOrder: undefined,
      lastDecision: undefined,
      economics: zeroEcon,
    }))

    // 3. Check if we already have recorded simulation events from the current live run
    const recorded = log
      .filter((e) => Boolean(e.payload && e.payload.event))
      .map((e) => e.payload)
      .reverse() // shiftStore keeps newest first; replay requires chronological (oldest first)

    if (recorded.length > 0 && recorded.some((e) => e.event === 'order_offered')) {
      enterReplay(recorded)
      return
    }

    // 4. Otherwise fetch the deterministic replay log from backend
    try {
      const currentSeed = useShiftStore.getState().seed ?? 1
      const currentVehicle = useShiftStore.getState().vehicle ?? 'moto'
      const real = await fetchReplayLogApi(currentSeed, 30, currentVehicle)
      enterReplay(real)
    } catch {
      enterReplay(MOCK_REPLAY_LOG)
    }
  }

  const agents = [ourAgent, baseline]

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        <AgentsComparisonBar agents={agents} />

        {/* Control bar — switches between live controls and replay controls */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 py-2">
          {isReplay ? (
            <ReplayControls />
          ) : (
            <>
              <SimulationControls />
              <div className="flex items-center gap-3">
                <ShockTriggerControl />
                <div className="ml-2 h-5 w-px bg-neutral-200" aria-hidden />
                <button
                  type="button"
                  onClick={handleEnterReplay}
                  className="rounded border border-orange-300 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-800 hover:bg-orange-100"
                >
                  Enter Replay ⏪
                </button>
              </div>
            </>
          )}
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
