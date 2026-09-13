import type {
  CourierStatus,
  DecideResponse,
  ExplainDecisionResponse,
  OrderOffered,
} from '../types'
import { AgentMap } from './AgentMap'
import { CurrentOrderCard } from './CurrentOrderCard'
import { DecisionBadge } from './DecisionBadge'
import { EarningsCounter } from './EarningsCounter'
import {
  ExplainDecisionModal,
  useExplainDecisionModal,
} from './ExplainDecisionModal'

export interface AgentEconomics {
  earningsMxn: number
  ordersCompleted: number
  mxnPerHour: number
  ordersAccepted: number
  ordersRejected: number
  distanceKm: number
  safetyViolations: number
}

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
  economics: AgentEconomics
  /**
   * Explain payload keyed by order_id — works for current or past decisions
   * (timeline can open any entry without depending on currentOrder).
   */
  explanationsByOrderId?: Record<string, ExplainDecisionResponse>
}

export const STATUS_STYLES: Record<CourierStatus, string> = {
  idle: 'bg-neutral-200 text-neutral-800',
  to_pickup: 'bg-sky-100 text-sky-900',
  waiting: 'bg-orange-100 text-orange-900',
  to_dropoff: 'bg-emerald-100 text-emerald-900',
  on_break: 'bg-violet-100 text-violet-900',
}

export const STATUS_LABELS: Record<CourierStatus, string> = {
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
  const { open, explanation, openExplanation, closeExplanation } =
    useExplainDecisionModal()

  const pastExplanations = Object.values(agent.explanationsByOrderId ?? {})

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
        <EarningsCounter economics={agent.economics} />

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
            onClick={() => {
              const payload =
                agent.explanationsByOrderId?.[agent.lastDecision!.order_id]
              if (payload) openExplanation(payload)
            }}
          />
        ) : (
          <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 px-3 py-4 text-xs text-neutral-500">
            No decision yet
          </div>
        )}

        {pastExplanations.length > 0 ? (
          <div>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Timeline
            </h3>
            <ul className="space-y-1">
              {pastExplanations.map((payload) => (
                <li key={payload.order_id}>
                  <button
                    type="button"
                    onClick={() => openExplanation(payload)}
                    className="flex w-full items-center justify-between gap-2 rounded border border-neutral-200 bg-white px-2.5 py-1.5 text-left text-xs hover:border-neutral-400 hover:bg-neutral-50"
                  >
                    <span className="font-mono text-neutral-800">
                      {payload.order_id}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        payload.decision === 'ACCEPT'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {payload.decision}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <ExplainDecisionModal
        open={open}
        explanation={explanation}
        onClose={closeExplanation}
      />
    </section>
  )
}
