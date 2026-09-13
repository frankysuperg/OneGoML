import { useEffect, useMemo, useRef, useState } from 'react'
import { explainForDecision, shockLabel } from '../data/mockTimeline'
import { formatSimClock } from '../lib/formatTime'
import { useShiftStore } from '../store/shiftStore'
import type { SimulatorEvent } from '../types'
import {
  ExplainDecisionModal,
  useExplainDecisionModal,
} from './ExplainDecisionModal'

const PAGE = 50

const TYPE_STYLE: Record<
  SimulatorEvent['event'],
  { badge: string; label: string; icon: string; border: string }
> = {
  shift_start: {
    badge: 'bg-emerald-700 text-white',
    label: 'shift start',
    icon: '▶',
    border: 'border-l-emerald-600',
  },
  order_offered: {
    badge: 'bg-sky-700 text-white',
    label: 'order',
    icon: '📦',
    border: 'border-l-sky-500',
  },
  decision: {
    badge: 'bg-neutral-950 text-white',
    label: 'decision',
    icon: '🤖',
    border: 'border-l-neutral-800',
  },
  position_update: {
    badge: 'bg-neutral-200 text-neutral-800',
    label: 'position',
    icon: '📍',
    border: 'border-l-neutral-300',
  },
  earnings_update: {
    badge: 'text-neutral-950',
    label: 'earnings',
    icon: '💰',
    border: 'border-l-yellow-400',
  },
  shock: {
    badge: 'bg-red-700 text-white',
    label: 'shock',
    icon: '⚡',
    border: 'border-l-red-600',
  },
  strategy_update: {
    badge: 'bg-violet-700 text-white',
    label: 'strategy',
    icon: '🧭',
    border: 'border-l-violet-500',
  },
  shift_end: {
    badge: 'bg-neutral-600 text-white',
    label: 'shift end',
    icon: '⏹',
    border: 'border-l-neutral-500',
  },
}

function summary(event: SimulatorEvent): string {
  switch (event.event) {
    case 'shift_start':
      return `seed ${event.seed} · ${event.vehicle} · z${event.start_location_zone}`
    case 'order_offered':
      return `${event.order_id} · z${event.zone_pickup}→z${event.zone_dropoff}`
    case 'decision':
      return `${event.order_id} · ${event.decision}`
    case 'position_update':
      return `z${event.zone} · ${event.status}`
    case 'earnings_update':
      return `$${event.earnings_mxn.toFixed(0)} · ${event.orders_completed} done`
    case 'shock':
      return shockLabel(event)
    case 'strategy_update':
      return `wage ${event.reservation_wage_mxn_hr} · z${event.target_zone ?? '—'}`
    case 'shift_end':
      return `$${event.earnings_mxn ?? 0} · ${event.orders_completed ?? 0} done`
  }
}

export function EventTimeline() {
  const events = useShiftStore((s) => s.events)
  const explanations = useShiftStore((s) => s.explanationsByOrderId)
  const { open, explanation, openExplanation, closeExplanation } =
    useExplainDecisionModal()
  const [limit, setLimit] = useState(PAGE)
  const scrollRef = useRef<HTMLOListElement>(null)
  const prevLenRef = useRef(events.length)

  // Auto-scroll to top when new events are prepended
  useEffect(() => {
    if (events.length > prevLenRef.current) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
    prevLenRef.current = events.length
  }, [events.length])

  const visible = useMemo(() => events.slice(0, limit), [events, limit])
  const remaining = events.length - visible.length

  return (
    <aside className="flex min-h-0 w-[20rem] shrink-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <header className="flex items-baseline justify-between gap-2 border-b border-neutral-200 px-3 py-2">
        <h2 className="text-sm font-semibold text-neutral-950">Timeline</h2>
        <p className="text-[10px] tabular-nums text-neutral-500">
          {events.length} events
        </p>
      </header>

      <ol ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
        {visible.map((entry) => {
          const { payload } = entry
          const style = TYPE_STYLE[payload.event]
          const isDecision = payload.event === 'decision'
          const explain =
            isDecision && payload.event === 'decision'
              ? (explanations[payload.order_id] ??
                explainForDecision(
                  payload.order_id,
                  payload.decision,
                  payload.reason,
                ))
              : undefined

          const body = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}
                  style={
                    payload.event === 'earnings_update'
                      ? { backgroundColor: '#fbf546' }
                      : undefined
                  }
                >
                  <span aria-hidden>{style.icon}</span>
                  {style.label}
                </span>
                <time className="text-[10px] tabular-nums text-neutral-500">
                  {formatSimClock(payload.sim_time)}
                </time>
              </div>
              <p className="mt-1 text-xs leading-snug text-neutral-800">
                {summary(payload)}
              </p>
            </>
          )

          if (isDecision) {
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  title="Click to see why this decision was made"
                  onClick={() => {
                    if (explain) openExplanation(explain)
                  }}
                  className={`w-full rounded-md border border-l-2 border-neutral-200 bg-white px-2 py-1.5 text-left hover:border-neutral-400 hover:bg-neutral-50 ${style.border}`}
                >
                  {body}
                </button>
              </li>
            )
          }

          return (
            <li
              key={entry.id}
              className={`rounded-md border border-l-2 border-neutral-100 bg-neutral-50 px-2 py-1.5 ${style.border}`}
            >
              {body}
            </li>
          )
        })}
      </ol>

      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="border-t border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Load older ({remaining})
        </button>
      ) : null}

      <ExplainDecisionModal
        open={open}
        explanation={explanation}
        onClose={closeExplanation}
      />
    </aside>
  )
}
