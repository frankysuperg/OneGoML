import { addSimMinutes, simTimeMs } from '../lib/simTime'
import type { ActiveShock } from '../store/types'
import type {
  CourierStatus,
  ExplainDecisionResponse,
  ShockEvent,
  ShockType,
  SimulatorEvent,
} from '../types'

export interface TimelineEntry {
  id: string
  payload: SimulatorEvent
}

export const SHIFT_START_TIME = '2026-03-21T15:00:00'
export const INITIAL_SIM_TIME = '2026-03-21T18:50:00'
export const SHIFT_END_TIME = '2026-03-21T23:00:00'

const ZONES = [5, 7, 9, 11]
const STATUSES: CourierStatus[] = [
  'idle',
  'to_pickup',
  'waiting',
  'to_dropoff',
  'on_break',
]

let seq = 0

export function newEntryId(): string {
  seq += 1
  return `evt-${seq}`
}

export function toEntry(payload: SimulatorEvent): TimelineEntry {
  return { id: newEntryId(), payload }
}

export function shockLabel(event: ShockEvent): string {
  if (event.shock_type === 'surge') {
    const mult = event.multiplier ?? 1.6
    const zone = event.zone ?? 11
    return `surge ×${mult} · z${zone}`
  }
  if (event.shock_type === 'closure') {
    return `closure · ${event.road ?? 'road closed'}`
  }
  if (event.shock_type === 'rain') {
    return `rain · ${event.duration_min ?? 40} min`
  }
  return `delay +${event.slip_min ?? 12} min`
}

export function shockToActive(event: ShockEvent): ActiveShock {
  return {
    shock_type: event.shock_type,
    zone: event.zone,
    label: shockLabel(event),
  }
}

export function buildShockEvent(
  simTime: string,
  shockType: ShockType,
): ShockEvent {
  if (shockType === 'surge') {
    return {
      event: 'shock',
      sim_time: simTime,
      shock_type: 'surge',
      zone: 11,
      multiplier: 1.6,
      duration_min: 25,
    }
  }
  if (shockType === 'closure') {
    return {
      event: 'shock',
      sim_time: simTime,
      shock_type: 'closure',
      road: 'Av. Constitución',
      duration_min: 30,
    }
  }
  if (shockType === 'rain') {
    return {
      event: 'shock',
      sim_time: simTime,
      shock_type: 'rain',
      zone: 5,
      duration_min: 40,
    }
  }
  return {
    event: 'shock',
    sim_time: simTime,
    shock_type: 'delay',
    order_id: 'ORD-0001',
    slip_min: 12,
  }
}

export function buildShiftStart(): SimulatorEvent {
  return {
    event: 'shift_start',
    sim_time: SHIFT_START_TIME,
    seed: 1,
    shift_hours: 8,
    vehicle: 'moto',
    start_location_zone: 7,
    shift_end_time: SHIFT_END_TIME,
    fuel_mxn_per_km: 1.2,
  }
}

export function buildShiftEnd(simTime: string): SimulatorEvent {
  return {
    event: 'shift_end',
    sim_time: simTime,
    orders_offered: 118,
    orders_completed: 23,
    earnings_mxn: 961,
    safety_violations: 0,
  }
}

function fillerEvent(i: number, simTime: string): SimulatorEvent {
  const kind = i % 6
  if (kind === 0) {
    return {
      event: 'position_update',
      sim_time: simTime,
      zone: ZONES[i % ZONES.length],
      status: STATUSES[i % STATUSES.length],
    }
  }
  if (kind === 1) {
    return {
      event: 'earnings_update',
      sim_time: simTime,
      earnings_mxn: 80 + i * 3.5,
      orders_completed: Math.floor(i / 8),
      mxn_per_hr: 90 + (i % 40),
    }
  }
  if (kind === 2) {
    const orderId = `ORD-${String(200 + i).padStart(4, '0')}`
    return {
      event: 'order_offered',
      order_id: orderId,
      sim_time: simTime,
      zone_pickup: ZONES[i % ZONES.length],
      zone_dropoff: ZONES[(i + 1) % ZONES.length],
      distance_pickup_km: 0.4 + (i % 9) * 0.2,
      distance_delivery_km: 1.5 + (i % 7) * 0.4,
      base_pay_mxn: 35 + (i % 20),
      surge_multiplier: 1 + (i % 3) * 0.2,
      vehicle: 'moto',
    }
  }
  if (kind === 3) {
    const orderId = `ORD-${String(200 + i).padStart(4, '0')}`
    return {
      event: 'decision',
      order_id: orderId,
      sim_time: simTime,
      decision: i % 5 === 0 ? 'SKIP' : 'ACCEPT',
      reason:
        i % 5 === 0
          ? 'Rate below reservation wage on this mock ping.'
          : 'Cleared reservation wage; safety gates open.',
      latency_ms: 3 + (i % 8),
      tier: 'tier1',
      degraded: false,
    }
  }
  if (kind === 4) {
    return {
      event: 'strategy_update',
      sim_time: simTime,
      reservation_wage_mxn_hr: 160 + (i % 30),
      target_zone: ZONES[i % ZONES.length],
      reasoning: 'Mock strategy nudge toward denser zone.',
      confidence: i % 2 === 0 ? 'high' : 'medium',
      degraded: i % 11 === 0,
    }
  }
  return {
    event: 'position_update',
    sim_time: simTime,
    zone: ZONES[(i + 2) % ZONES.length],
    status: STATUSES[(i + 1) % STATUSES.length],
  }
}

export function explainForDecision(
  orderId: string,
  decision: 'ACCEPT' | 'SKIP',
  reason: string,
): ExplainDecisionResponse {
  return {
    order_id: orderId,
    decision,
    reason,
    inputs: {
      mock: true,
      order_id: orderId,
    },
    alternatives_considered: [
      {
        option: decision === 'ACCEPT' ? 'SKIP' : 'ACCEPT',
        rejected_because: 'Mock step: other option lost on pay or safety.',
      },
    ],
  }
}

/** Chronological seed, returned newest-first. ~150 events. */
export function buildSeedLog(): TimelineEntry[] {
  seq = 0
  const chrono: SimulatorEvent[] = [buildShiftStart()]

  for (let i = 1; i <= 130; i++) {
    chrono.push(fillerEvent(i, addSimMinutes(SHIFT_START_TIME, i * 1.5)))
  }

  chrono.push({
    event: 'order_offered',
    order_id: 'ORD-0098',
    sim_time: '2026-03-21T17:10:00',
    zone_pickup: 9,
    zone_dropoff: 7,
    distance_pickup_km: 0.8,
    distance_delivery_km: 4.2,
    base_pay_mxn: 44,
    surge_multiplier: 1,
    vehicle: 'moto',
  })
  chrono.push({
    event: 'decision',
    order_id: 'ORD-0098',
    sim_time: '2026-03-21T17:10:00',
    decision: 'SKIP',
    reason: 'Heat rule bound after 95 min continuous riding without a break.',
    latency_ms: 4,
    tier: 'tier1',
    binding_constraint: 'heat_rule',
    degraded: false,
  })
  chrono.push({
    event: 'order_offered',
    order_id: 'ORD-0001',
    platform: 'rappi',
    sim_time: '2026-03-21T18:42:00',
    zone_pickup: 7,
    zone_dropoff: 11,
    distance_pickup_km: 1.4,
    distance_delivery_km: 6.5,
    base_pay_mxn: 58,
    surge_multiplier: 1.3,
    vehicle: 'moto',
  })
  chrono.push({
    event: 'decision',
    order_id: 'ORD-0001',
    sim_time: '2026-03-21T18:42:00',
    decision: 'ACCEPT',
    reason: 'Adjusted rate 192 MXN/hr clears reservation wage; capacity ok.',
    latency_ms: 6,
    tier: 'tier1',
    binding_constraint: null,
    degraded: false,
  })
  chrono.push({
    event: 'shock',
    sim_time: '2026-03-21T18:50:00',
    shock_type: 'surge',
    zone: 11,
    multiplier: 1.6,
    duration_min: 25,
  })
  chrono.push({
    event: 'strategy_update',
    sim_time: '2026-03-21T18:50:00',
    reservation_wage_mxn_hr: 185,
    target_zone: 11,
    reasoning: 'Hold reservation wage; ride the z11 surge.',
    confidence: 'high',
    degraded: false,
  })
  chrono.push({
    event: 'order_offered',
    order_id: 'ORD-0002',
    platform: 'didi',
    sim_time: '2026-03-21T18:50:00',
    zone_pickup: 5,
    zone_dropoff: 5,
    distance_pickup_km: 0.6,
    distance_delivery_km: 1.8,
    base_pay_mxn: 41,
    surge_multiplier: 1,
    vehicle: 'moto',
  })
  chrono.push({
    event: 'decision',
    order_id: 'ORD-0002',
    sim_time: '2026-03-21T18:50:00',
    decision: 'SKIP',
    reason: 'Package exceeds bike bag volume after in-flight stack.',
    latency_ms: 3,
    tier: 'tier1',
    binding_constraint: 'vehicle_capacity',
    degraded: false,
  })

  return chrono
    .map(toEntry)
    .sort(
      (a, b) => simTimeMs(b.payload.sim_time) - simTimeMs(a.payload.sim_time),
    )
}

const STEP_STATUSES: CourierStatus[] = [
  'to_pickup',
  'waiting',
  'to_dropoff',
  'idle',
]

export function nextStepEvent(cursor: number, simTime: string): SimulatorEvent {
  const kind = cursor % 5
  if (kind === 0) {
    return {
      event: 'position_update',
      sim_time: simTime,
      zone: ZONES[cursor % ZONES.length],
      status: STEP_STATUSES[cursor % STEP_STATUSES.length],
    }
  }
  if (kind === 1) {
    return {
      event: 'earnings_update',
      sim_time: simTime,
      earnings_mxn: 800 + cursor * 4,
      orders_completed: 9 + Math.floor(cursor / 5),
      mxn_per_hr: 180 + (cursor % 12),
    }
  }
  if (kind === 2) {
    const orderId = `ORD-S${String(cursor).padStart(3, '0')}`
    return {
      event: 'order_offered',
      order_id: orderId,
      sim_time: simTime,
      zone_pickup: 7,
      zone_dropoff: 11,
      distance_pickup_km: 1.1,
      distance_delivery_km: 3.2,
      base_pay_mxn: 48,
      surge_multiplier: 1.2,
      vehicle: 'moto',
    }
  }
  if (kind === 3) {
    const orderId = `ORD-S${String(cursor).padStart(3, '0')}`
    return {
      event: 'decision',
      order_id: orderId,
      sim_time: simTime,
      decision: cursor % 2 === 0 ? 'ACCEPT' : 'SKIP',
      reason:
        cursor % 2 === 0
          ? 'Mock step: rate clears reservation wage.'
          : 'Mock step: skip, rate below reservation wage.',
      latency_ms: 5,
      tier: 'tier1',
      degraded: false,
    }
  }
  return {
    event: 'strategy_update',
    sim_time: simTime,
    reservation_wage_mxn_hr: 185,
    target_zone: 11,
    reasoning: 'Mock step: keep targeting surge zone.',
    confidence: 'medium',
    degraded: false,
  }
}
