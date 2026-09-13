import { formatKm, formatMxn, formatMxnPerHour } from '../lib/formatMetrics'
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
  className?: string
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

export function AgentsComparisonBar({ agents, className }: AgentsComparisonBarProps) {

  const rows: MetricRow[] = [
    {
      id: 'rate',
      label: 'Hourly Rate (MXN/h)',
      better: 'max',
      numeric: agents.map((a) => a.economics.mxnPerHour),
      values: agents.map((a) => formatMxnPerHour(a.economics.mxnPerHour)),
    },
    {
      id: 'earnings',
      label: 'Total earnings',
      better: 'max',
      numeric: agents.map((a) => a.economics.earningsMxn),
      values: agents.map((a) => formatMxn(a.economics.earningsMxn, 0)),
    },
    {
      id: 'efficiency',
      label: 'Efficiency (MXN/km)',
      better: 'max',
      numeric: agents.map((a) =>
        a.economics.distanceKm > 0
          ? a.economics.earningsMxn / a.economics.distanceKm
          : 0,
      ),
      values: agents.map((a) =>
        a.economics.distanceKm > 0
          ? `$${(a.economics.earningsMxn / a.economics.distanceKm).toFixed(1)}/km`
          : '—',
      ),
    },
    {
      id: 'distance',
      label: 'Distance traveled',
      better: 'min',
      numeric: agents.map((a) => a.economics.distanceKm),
      values: agents.map((a) => formatKm(a.economics.distanceKm)),
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
    <div className={`shrink-0 rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden ${className ?? ''}`}>
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50/80 px-3 py-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-1.5">
          <span>⚖️</span> Head to Head
        </h2>
        <span className="text-[10px] text-neutral-500 font-medium">Comparativa en vivo</span>
      </header>
      <div className="overflow-x-auto p-2">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr>
              <th className="py-1 pr-2 font-medium text-neutral-500 text-xs">
                Métrica
              </th>
              {agents.map((agent) => (
                <th
                  key={agent.name}
                  className="py-1 px-1.5 text-right font-semibold text-neutral-950 text-xs truncate max-w-[5rem]"
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
                <tr key={row.id} className="border-t border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                  <th className="py-1 pr-2 font-medium text-neutral-600 text-xs">
                    {row.label}
                  </th>
                  {row.values.map((value, i) => {
                    const isBest = win === i
                    return (
                      <td key={`${row.id}-${i}`} className="py-1 px-1.5 text-right">
                        <span
                          className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 tabular-nums text-xs ${
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
