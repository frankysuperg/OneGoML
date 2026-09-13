import { useCallback, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ExplainDecisionResponse } from '../types'

export interface ExplainDecisionModalProps {
  /** Current or historical payload — never read from "current order" state. */
  explanation: ExplainDecisionResponse | null
  open: boolean
  onClose: () => void
}

/**
 * Local UI state only. Opening/closing must not touch the shift store
 * or pause the simulation clock.
 */
export function useExplainDecisionModal() {
  const [open, setOpen] = useState(false)
  const [explanation, setExplanation] =
    useState<ExplainDecisionResponse | null>(null)

  const openExplanation = useCallback((payload: ExplainDecisionResponse) => {
    setExplanation(payload)
    setOpen(true)
  }, [])

  const closeExplanation = useCallback(() => {
    setOpen(false)
  }, [])

  return { open, explanation, openExplanation, closeExplanation }
}

function formatLabel(key: string): string {
  return key.replace(/_/g, ' ')
}

function formatPrimitive(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '—'
  }
  if (typeof value === 'string') return value
  return String(value)
}

function InputRows({
  data,
  depth = 0,
}: {
  data: Record<string, unknown>
  depth?: number
}) {
  const entries = Object.entries(data)
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-500">No inputs recorded.</p>
  }

  return (
    <ul className="space-y-1.5">
      {entries.map(([key, value]) => {
        const isNested =
          value !== null && typeof value === 'object' && !Array.isArray(value)

        if (isNested) {
          return (
            <li key={key} style={{ paddingLeft: depth * 12 }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {formatLabel(key)}
              </p>
              <div className="mt-1 border-l border-neutral-200 pl-3">
                <InputRows
                  data={value as Record<string, unknown>}
                  depth={depth + 1}
                />
              </div>
            </li>
          )
        }

        if (Array.isArray(value)) {
          const hasObjects = value.some(
            (item) => item !== null && typeof item === 'object',
          )

          if (hasObjects) {
            return (
              <li key={key} style={{ paddingLeft: depth * 12 }}>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {formatLabel(key)}
                </p>
                <ul className="mt-1 space-y-2 border-l border-neutral-200 pl-3">
                  {value.map((item, i) =>
                    item !== null && typeof item === 'object' && !Array.isArray(item) ? (
                      <li key={i}>
                        <InputRows
                          data={item as Record<string, unknown>}
                          depth={depth + 1}
                        />
                      </li>
                    ) : (
                      <li key={i} className="text-sm text-neutral-950 tabular-nums">
                        {formatPrimitive(item)}
                      </li>
                    ),
                  )}
                </ul>
              </li>
            )
          }

          return (
            <li
              key={key}
              className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm"
              style={{ paddingLeft: depth * 12 }}
            >
              <span className="font-medium text-neutral-600">
                {formatLabel(key)}
              </span>
              <span className="text-neutral-950 tabular-nums">
                {value.length === 0
                  ? '[]'
                  : value.map((item) => formatPrimitive(item)).join(', ')}
              </span>
            </li>
          )
        }

        return (
          <li
            key={key}
            className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm"
            style={{ paddingLeft: depth * 12 }}
          >
            <span className="font-medium text-neutral-600">
              {formatLabel(key)}
            </span>
            <span className="text-neutral-950 tabular-nums">
              {formatPrimitive(value)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function ExplainDecisionModal({
  explanation,
  open,
  onClose,
}: ExplainDecisionModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !explanation) return null

  const isAccept = explanation.decision === 'ACCEPT'

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close explanation"
        className="absolute inset-0 bg-neutral-950/50"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[101] flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p
              id={titleId}
              className="text-xs font-medium uppercase tracking-wide text-neutral-500"
            >
              Why this decision?
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-neutral-950">
                {explanation.order_id}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
                  isAccept
                    ? 'bg-emerald-600 text-white'
                    : 'bg-red-600 text-white'
                }`}
              >
                {explanation.decision}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-neutral-700">{explanation.reason}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Close
          </button>
        </header>

        <div className="overflow-y-auto px-4 py-4 space-y-5">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Inputs at decision time
            </h3>
            <InputRows data={explanation.inputs} />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Alternatives considered
            </h3>
            {explanation.alternatives_considered.length === 0 ? (
              <p className="text-sm text-neutral-500">None recorded.</p>
            ) : (
              <ul className="space-y-2">
                {explanation.alternatives_considered.map((alt, i) => (
                  <li
                    key={`${alt.option}-${i}`}
                    className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-neutral-950">
                      {alt.option}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-600">
                      {alt.rejected_because}
                    </p>
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
