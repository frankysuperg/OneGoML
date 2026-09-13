import type { ShockType, Vehicle } from '../types'
import type { TimelineEntry } from '../data/mockTimeline'
import type { ExplainDecisionResponse } from '../types'

export type SimulationStatus = 'Running' | 'Paused' | 'Replay' | 'Finished'

export type ModelConnectionStatus = 'online' | 'degraded' | 'offline'

export type SimSpeed = 1 | 2 | 4 | 8

export interface ActiveShock {
  shock_type: ShockType
  zone?: number
  label: string
}

export interface ShiftSnapshot {
  status: SimulationStatus
  simTime: string
  shiftEndTime: string
  shiftHours: number
  vehicle: Vehicle
  startLocationZone: number
  seed: number
  modelConnection: ModelConnectionStatus
  activeShocks: ActiveShock[]
  speed: SimSpeed
  events: TimelineEntry[]
  explanationsByOrderId: Record<string, ExplainDecisionResponse>
  stepCursor: number
}
