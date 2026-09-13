import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatKm, formatMxn, formatMxnPerHour } from '../lib/formatMetrics'
import { formatElapsed } from '../lib/formatTime'
import { useShiftStore } from '../store/shiftStore'
import type { ActiveShock } from '../store/types'
import type { AgentViewModel } from './AgentPanel'

interface ShiftEndSummaryProps {
  agents: AgentViewModel[]
  shocksFaced: ActiveShock[]
}

function pickWinner(agents: AgentViewModel[]): string {
  if (agents.length === 0) return '—'
  const ranked = [...agents].sort((a, b) => {
    // Primary criterion: highest earnings per hour (MXN/h)
    const rate = b.economics.mxnPerHour - a.economics.mxnPerHour
    if (rate !== 0) return rate
    // Secondary criterion: total earnings
    const earn = b.economics.earningsMxn - a.economics.earningsMxn
    if (earn !== 0) return earn
    // Tertiary criterion: fewest safety violations
    return a.economics.safetyViolations - b.economics.safetyViolations
  })
  const top = ranked[0]
  const second = ranked[1]
  if (
    second &&
    top.economics.mxnPerHour === second.economics.mxnPerHour &&
    top.economics.earningsMxn === second.economics.earningsMxn &&
    top.economics.safetyViolations === second.economics.safetyViolations
  ) {
    return 'Tie'
  }
  return top.name
}

export function ShiftEndSummary({
  agents,
  shocksFaced,
}: ShiftEndSummaryProps) {
  const status = useShiftStore((s) => s.status)
  const simTime = useShiftStore((s) => s.simTime)
  const shiftEndTime = useShiftStore((s) => s.shiftEndTime)
  const shiftHours = useShiftStore((s) => s.shiftHours)
  const setStatus = useShiftStore((s) => s.setStatus)
  const titleId = useId()
  const [dismissed, setDismissed] = useState(false)

  const open = status === 'Finished' && !dismissed

  useEffect(() => {
    if (status !== 'Finished') setDismissed(false)
  }, [status])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDismissed(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const winner = pickWinner(agents)
  const timeUsed = formatElapsed(simTime, shiftEndTime, shiftHours)

  const dialog = (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close shift summary"
        className="absolute inset-0 bg-neutral-950/50"
        onClick={() => setDismissed(true)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[111] flex max-h-[min(92vh,44rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
          <div>
            <p
              id={titleId}
              className="text-xs font-medium uppercase tracking-wide text-neutral-500"
            >
              Shift end
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight text-neutral-950">
              {winner === 'Tie' ? 'Tie' : `${winner} won`}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setStatus('Running')}
              className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Mock: Running
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Close
            </button>
          </div>
        </header>

        <div className="overflow-y-auto px-4 py-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {agents.map((agent) => {
              const isWinner = winner === agent.name
              return (
                <article
                  key={agent.name}
                  className={`rounded-lg border px-3 py-3 ${
                    isWinner
                      ? 'border-amber-400 bg-amber-50/70 shadow-sm'
                      : 'border-neutral-200 bg-neutral-50'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-neutral-950">
                      {agent.name}
                    </h3>
                    {isWinner ? (
                      <span className="rounded bg-neutral-950 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Winner
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={`mt-2 inline-block rounded px-2 py-0.5 text-xl font-bold tabular-nums text-neutral-950 ${
                      isWinner ? 'bg-[#fbf546]' : 'bg-neutral-200/80 text-neutral-700'
                    }`}
                  >
                    {formatMxnPerHour(agent.economics.mxnPerHour)}
                  </p>
                  <dl className="mt-3 space-y-1 text-sm">
                    <Row
                      label="Total earnings"
                      value={formatMxn(agent.economics.earningsMxn, 0)}
                    />
                    <Row
                      label="Completed"
                      value={String(agent.economics.ordersCompleted)}
                    />
                    <Row
                      label="Accepted / skipped"
                      value={`${agent.economics.ordersAccepted}/${agent.economics.ordersRejected}`}
                    />
                    <Row
                      label="Safety violations"
                      value={String(agent.economics.safetyViolations)}
                    />
                    <Row
                      label="Distance"
                      value={formatKm(agent.economics.distanceKm)}
                    />
                    <Row label="Time used" value={timeUsed} />
                  </dl>
                </article>
              )
            })}
          </div>

          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Shocks faced
            </h3>
            {shocksFaced.length === 0 ? (
              <p className="text-sm text-neutral-500">None recorded.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {shocksFaced.map((shock) => (
                  <li
                    key={shock.label}
                    className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-800"
                  >
                    {shock.label}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium tabular-nums text-neutral-950">{value}</dd>
    </div>
  )
}
