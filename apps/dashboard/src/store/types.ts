import type { ShockType, SimulatorEvent, Vehicle } from '../types'
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
  /** Replay mode state — null when not in replay */
  replayLog: SimulatorEvent[] | null
  /** Seed from the replayed log's shift_start event */
  replaySeed: number | null
  /** Index into replayLog of the next event to emit (chronological) */
  replayCursor: number
  /** Whether replay is actively playing (ticking) */
  replayPlaying: boolean
}
