import { formatMxn, formatMxnPerHour } from '../lib/formatMetrics'
import type { AgentViewModel } from './AgentPanel'
import { STATUS_LABELS } from './AgentPanel'

/**
 * Scoreboard in document flow just under the TopBar (not a second `fixed`
 * layer). The yellow bar keeps sim clock + shocks; this strip is the
 * head-to-head table glued above the two panels. Panel height then flexes
 * with `min-h-0` instead of stacking two viewport offsets that clip the map.
 */
interface AgentsComparisonBarProps {
  agents: AgentViewModel[]
}

type Better = 'max' | 'min' | 'none'

interface MetricRow {
  id: string
  label: string
  better: Better
  values: string[]
  numeric: number[]
}

function winnerIndex(numeric: number[], better: Better): number | null {
  if (better === 'none' || numeric.length < 2) return null
  const best =
    better === 'max' ? Math.max(...numeric) : Math.min(...numeric)
  const hits = numeric
    .map((v, i) => (v === best ? i : -1))
    .filter((i) => i >= 0)
  return hits.length === 1 ? hits[0] : null
}

export function AgentsComparisonBar({ agents }: AgentsComparisonBarProps) {

  const rows: MetricRow[] = [
    {
      id: 'earnings',
      label: 'Earnings',
      better: 'max',
      numeric: agents.map((a) => a.economics.earningsMxn),
      values: agents.map((a) => formatMxn(a.economics.earningsMxn, 0)),
    },
    {
      id: 'rate',
      label: 'MXN/h',
      better: 'max',
      numeric: agents.map((a) => a.economics.mxnPerHour),
      values: agents.map((a) => formatMxnPerHour(a.economics.mxnPerHour)),
    },
    {
      id: 'completed',
      label: 'Orders completed',
      better: 'max',
      numeric: agents.map((a) => a.economics.ordersCompleted),
      values: agents.map((a) => String(a.economics.ordersCompleted)),
    },
    {
      id: 'accepted',
      label: 'Orders accepted',
      better: 'max',
      numeric: agents.map((a) => a.economics.ordersAccepted),
      values: agents.map((a) => String(a.economics.ordersAccepted)),
    },
    {
      id: 'safety',
      label: 'Safety violations',
      better: 'min',
      numeric: agents.map((a) => a.economics.safetyViolations),
      values: agents.map((a) => String(a.economics.safetyViolations)),
    },
    {
      id: 'status',
      label: 'Current status',
      better: 'none',
      numeric: agents.map(() => 0),
      values: agents.map((a) => STATUS_LABELS[a.status]),
    },
  ]

  return (
    <div className="shrink-0 border-b border-neutral-200 bg-white">
      <header className="flex items-center gap-3 px-3 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Head to head
        </p>
      </header>
      <div className="overflow-x-auto px-3 pb-2 pt-1">
        <table className="w-auto border-collapse text-left text-xs">
          <thead>
            <tr>
              <th className="w-40 py-0.5 pr-4 font-medium text-neutral-500">
                Metric
              </th>
              {agents.map((agent) => (
                <th
                  key={agent.name}
                  className="w-36 py-0.5 pr-4 font-semibold text-neutral-950"
                >
                  {agent.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const win = winnerIndex(row.numeric, row.better)
              return (
                <tr key={row.id} className="border-t border-neutral-100">
                  <th className="py-0.5 pr-4 font-medium text-neutral-600">
                    {row.label}
                  </th>
                  {row.values.map((value, i) => {
                    const isBest = win === i
                    return (
                      <td key={`${row.id}-${i}`} className="py-0.5 pr-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 tabular-nums ${
                            isBest
                              ? 'bg-accent font-bold text-neutral-950'
                              : 'text-neutral-800'
                          }`}
                        >
                          {value}
                          {isBest ? (
                            <span aria-label="leading" className="text-[10px]">
                              ↑
                            </span>
                          ) : null}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
