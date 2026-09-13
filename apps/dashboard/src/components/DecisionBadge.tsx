import type { DecideResponse } from '../types'

interface DecisionBadgeProps {
  decision: DecideResponse
  onClick?: () => void
}

export function DecisionBadge({ decision, onClick }: DecisionBadgeProps) {
  const isAccept = decision.decision === 'ACCEPT'
  const outcomeClass = isAccept
    ? 'bg-emerald-600 text-white'
    : 'bg-red-600 text-white'

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-3 text-left transition hover:border-neutral-400 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2.5 py-1 text-base font-bold uppercase tracking-wide ${outcomeClass}`}
        >
          {decision.decision}
        </span>
        <span className="min-w-0 flex-1 text-sm text-neutral-800">
          <span className="font-semibold text-neutral-950">
            {decision.decision}
          </span>
          {' · '}
          <span>{decision.reason}</span>
        </span>
      </div>

      {decision.binding_constraint != null ? (
        <span className="mt-2 inline-block rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-700">
          {decision.binding_constraint}
        </span>
      ) : null}

      <p className="mt-2 text-[11px] text-neutral-500 tabular-nums">
        {decision.latency_ms} ms
        {decision.tier ? ` · ${decision.tier}` : ''}
      </p>
    </button>
  )
}
