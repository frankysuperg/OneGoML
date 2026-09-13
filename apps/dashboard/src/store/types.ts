import type { ShockType, Vehicle } from '../types'

export type SimulationStatus = 'Running' | 'Paused' | 'Replay' | 'Finished'

export type ModelConnectionStatus = 'online' | 'degraded' | 'offline'

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
}
