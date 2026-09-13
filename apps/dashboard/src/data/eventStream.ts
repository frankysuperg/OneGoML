import type { SimulatorEvent } from '../types'

export type EventHandler = (event: SimulatorEvent) => void
export type Unsubscribe = () => void

/**
 * Contract for any live or replay event feed into the dashboard.
 */
// TODO: implementaciones mock | ws | sse | polling se agregan en prompts posteriores
export interface EventSource {
  subscribe(handler: EventHandler): Unsubscribe
}
