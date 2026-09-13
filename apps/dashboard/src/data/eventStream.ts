import type { SimulatorEvent, ShockType } from '../types'

export type EventHandler = (event: SimulatorEvent) => void
export type Unsubscribe = () => void

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface EventStreamOptions {
  seed?: number
  nOffers?: number
  vehicle?: string
  speed?: number
  onEnd?: () => void
  onError?: (err: Event) => void
}

/**
 * Contract for any live or replay event feed into the dashboard.
 */
export interface EventSourceInterface {
  subscribe(handler: EventHandler): Unsubscribe
}

/**
 * Native Server-Sent Events (SSE) stream connector for OneGoML backend.
 */
export class SSEEventSource implements EventSourceInterface {
  private es: EventSource | null = null
  private handlers = new Set<EventHandler>()
  private options: EventStreamOptions

  constructor(options: EventStreamOptions = {}) {
    this.options = options
  }

  subscribe(handler: EventHandler): Unsubscribe {
    this.handlers.add(handler)
    if (!this.es) {
      this.connect()
    }

    return () => {
      this.handlers.delete(handler)
      if (this.handlers.size === 0) {
        this.disconnect()
      }
    }
  }

  private connect() {
    const {
      seed = 1,
      nOffers = 30,
      vehicle = 'moto',
      speed = 1,
      onEnd,
      onError,
    } = this.options

    const params = new URLSearchParams({
      seed: String(seed),
      n_offers: String(nOffers),
      vehicle,
      speed: String(speed),
    })

    const url = `${API_BASE}/events?${params.toString()}`
    this.es = new EventSource(url)

    this.es.onmessage = (e) => {
      try {
        const raw = JSON.parse(e.data) as Record<string, unknown>
        if (raw.event === 'stream_end') {
          onEnd?.()
          return
        }
        const payload = raw as unknown as SimulatorEvent
        for (const h of this.handlers) {
          h(payload)
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err, e.data)
      }
    }

    this.es.onerror = (err) => {
      onError?.(err)
      this.disconnect()
    }
  }

  disconnect() {
    if (this.es) {
      this.es.close()
      this.es = null
    }
  }
}

/**
 * Injects a shock event into the live backend simulation stream.
 */
export async function injectShockApi(body: {
  shock_type: ShockType
  zone?: number
  multiplier?: number
  road?: string
  slip_min?: number
  duration_min?: number
}) {
  const res = await fetch(`${API_BASE}/shock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Failed to inject shock: ${res.status}`)
  }
  return res.json()
}

/**
 * Fetches current simulation and model status.
 */
export async function fetchStatusApi() {
  const res = await fetch(`${API_BASE}/status`)
  if (!res.ok) {
    throw new Error(`Failed to fetch status: ${res.status}`)
  }
  return res.json()
}

/**
 * Toggles model degraded mode on backend.
 */
export async function toggleModelFailureApi(failed: boolean) {
  const res = await fetch(`${API_BASE}/model_failure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ failed }),
  })
  if (!res.ok) {
    throw new Error(`Failed to toggle model failure: ${res.status}`)
  }
  return res.json()
}

/**
 * Fetches full shift event log from backend for Replay mode.
 */
export async function fetchReplayLogApi(
  seed: number = 1,
  nOffers: number = 30,
  vehicle: string = 'moto',
): Promise<SimulatorEvent[]> {
  const params = new URLSearchParams({
    seed: String(seed),
    n_offers: String(nOffers),
    vehicle,
  })
  const res = await fetch(`${API_BASE}/replay/log?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch replay log: ${res.status}`)
  }
  const data = await res.json()
  return data.events as SimulatorEvent[]
}
