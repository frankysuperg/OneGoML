import { useCallback, useState } from 'react'
import type {
  CourierStatus,
  DecideResponse,
  ExplainDecisionResponse,
  OrderOffered,
} from '../types'
import { AgentMap } from './AgentMap'
import { CurrentOrderCard } from './CurrentOrderCard'
import { DecisionBadge } from './DecisionBadge'
import { ExplainDecisionModal } from './ExplainDecisionModal'

export interface AgentViewModel {
  name: string
  strategyType: string
  status: CourierStatus
  degraded: boolean
  /** Current courier zone (position_update.zone). */
  currentZoneId: number
  pickupZoneId?: number
  dropoffZoneId?: number
  currentOrder?: OrderOffered
  lastDecision?: DecideResponse
  /**
   * Explain payload keyed by order_id — works for current or past decisions
   * (timeline can open any entry without depending on currentOrder).
   */
  explanationsByOrderId?: Record<string, ExplainDecisionResponse>
}

const STATUS_STYLES: Record<CourierStatus, string> = {
  idle: 'bg-neutral-200 text-neutral-800',
  to_pickup: 'bg-sky-100 text-sky-900',
  waiting: 'bg-orange-100 text-orange-900',
  to_dropoff: 'bg-emerald-100 text-emerald-900',
  on_break: 'bg-violet-100 text-violet-900',
}

const STATUS_LABELS: Record<CourierStatus, string> = {
  idle: 'idle',
  to_pickup: 'to pickup',
  waiting: 'waiting',
  to_dropoff: 'to dropoff',
  on_break: 'on break',
}

interface AgentPanelProps {
  agent: AgentViewModel
}

export function AgentPanel({ agent }: AgentPanelProps) {
  // Local UI-only state — does not touch the shift store / simulation clock.
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainPayload, setExplainPayload] =
    useState<ExplainDecisionResponse | null>(null)

  const openExplanation = useCallback((payload: ExplainDecisionResponse) => {
    setExplainPayload(payload)
    setExplainOpen(true)
  }, [])

  const closeExplanation = useCallback(() => {
    setExplainOpen(false)
    setExplainPayload(null)
  }, [])

  const openDecisionExplain = useCallback(
    (orderId: string) => {
      const payload = agent.explanationsByOrderId?.[orderId]
      if (payload) openExplanation(payload)
    },
    [agent.explanationsByOrderId, openExplanation],
  )

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight text-neutral-950">
            {agent.name}
          </h2>
          <p className="mt-0.5 truncate text-xs text-neutral-600">
            {agent.strategyType}
          </p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLES[agent.status]}`}
        >
          {STATUS_LABELS[agent.status]}
        </span>
      </header>

      {agent.degraded ? (
        <div
          className="mx-4 mt-3 rounded border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-xs font-medium text-amber-200/90"
          role="status"
        >
          DEGRADED · Using last known strategy
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 overflow-y-auto">
        <div className="min-h-[12rem] flex-1">
          <AgentMap
            currentZoneId={agent.currentZoneId}
            pickupZoneId={agent.pickupZoneId}
            dropoffZoneId={agent.dropoffZoneId}
          />
        </div>

        {agent.currentOrder ? (
          <CurrentOrderCard order={agent.currentOrder} />
        ) : (
          <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 px-3 py-4 text-xs text-neutral-500">
            No active order
          </div>
        )}

        {agent.lastDecision ? (
          <DecisionBadge
            decision={agent.lastDecision}
            onClick={() => openDecisionExplain(agent.lastDecision!.order_id)}
          />
        ) : (
          <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 px-3 py-4 text-xs text-neutral-500">
            No decision yet
          </div>
        )}

        {/* TODO: economía — earnings, rates, reservation wage */}
        <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 px-3 py-4 text-xs text-neutral-500">
          Economics placeholder
        </div>
      </div>

      <ExplainDecisionModal
        open={explainOpen}
        explanation={explainPayload}
        onClose={closeExplanation}
      />
    </section>
  )
}
