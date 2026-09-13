import { useShiftStore } from '../store/shiftStore'
import {
  formatRemaining,
  formatShiftDurationHours,
  formatSimClock,
} from '../lib/formatTime'
import type { ModelConnectionStatus, SimulationStatus } from '../store/types'

function statusClass(status: SimulationStatus): string {
  if (status === 'Running') return 'bg-neutral-950 text-white'
  if (status === 'Paused') return 'border border-neutral-950 bg-white text-neutral-950'
  if (status === 'Replay') return 'bg-orange-600 text-white'
  return 'border border-neutral-950/40 bg-white/80 text-neutral-700'
}

function connectionLabel(status: ModelConnectionStatus): string {
  if (status === 'online') return 'Model online'
  if (status === 'degraded') return 'Strategy degraded'
  return 'Model offline'
}

function connectionClass(status: ModelConnectionStatus): string {
  if (status === 'online') return 'text-emerald-800'
  if (status === 'degraded') return 'text-amber-900'
  return 'text-red-800'
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-neutral-800/70">
        {label}
      </span>
      <span className="text-sm font-semibold text-neutral-950 tabular-nums truncate">
        {value}
      </span>
    </div>
  )
}

export function TopBar() {
  const status = useShiftStore((s) => s.status)
  const simTime = useShiftStore((s) => s.simTime)
  const shiftEndTime = useShiftStore((s) => s.shiftEndTime)
  const shiftHours = useShiftStore((s) => s.shiftHours)
  const vehicle = useShiftStore((s) => s.vehicle)
  const startLocationZone = useShiftStore((s) => s.startLocationZone)
  const seed = useShiftStore((s) => s.seed)
  const replaySeed = useShiftStore((s) => s.replaySeed)
  const modelConnection = useShiftStore((s) => s.modelConnection)
  const activeShocks = useShiftStore((s) => s.activeShocks)

  const isReplay = status === 'Replay'
  const hasShocks = activeShocks.length > 0
  const displaySeed = isReplay && replaySeed != null ? replaySeed : seed

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b bg-accent ${
        isReplay
          ? 'border-orange-500 border-b-2'
          : 'border-neutral-950/15'
      }`}
    >
      {/* Replay mode banner strip */}
      {isReplay && (
        <div className="flex items-center justify-center gap-2 bg-orange-600 px-4 py-0.5">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            ⏪ Replay mode — not live data
          </span>
        </div>
      )}

      <div className="flex h-14 items-center gap-4 px-4 overflow-x-auto">
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold tracking-tight text-neutral-950">
            OneGoML
          </span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusClass(status)}`}
          >
            {status}
          </span>
        </div>

        <div className="h-6 w-px shrink-0 bg-neutral-950/20" aria-hidden />

        <div className="flex items-center gap-5 shrink-0">
          <Meta label="Sim time" value={formatSimClock(simTime)} />
          {!isReplay && (
            <Meta
              label="Remaining"
              value={formatRemaining(simTime, shiftEndTime)}
            />
          )}
          <Meta
            label="Shift"
            value={isReplay ? 'Replay' : formatShiftDurationHours(shiftHours)}
          />
          <Meta label="Vehicle" value={vehicle} />
          <Meta label="Start zone" value={String(startLocationZone)} />
          <Meta
            label={isReplay ? 'Replay seed' : 'Seed'}
            value={String(displaySeed)}
          />
        </div>

        <div className="h-6 w-px shrink-0 bg-neutral-950/20" aria-hidden />

        <div className="flex items-center gap-4 shrink-0 ml-auto">
          {!isReplay && (
            <div className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  modelConnection === 'online'
                    ? 'bg-emerald-800'
                    : modelConnection === 'degraded'
                      ? 'bg-amber-900'
                      : 'bg-red-800'
                }`}
                aria-hidden
              />
              <span
                className={`text-xs font-semibold ${connectionClass(modelConnection)}`}
              >
                {connectionLabel(modelConnection)}
              </span>
            </div>
          )}

          <div
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold ${
              hasShocks
                ? isReplay
                  ? 'bg-orange-700 text-white'
                  : 'bg-neutral-950 text-white'
                : 'border border-neutral-950 bg-white text-neutral-700'
            }`}
            title={
              hasShocks
                ? activeShocks.map((s) => s.label).join(', ')
                : 'No active shocks'
            }
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                hasShocks ? 'bg-white' : 'bg-neutral-400'
              }`}
              aria-hidden
            />
            {hasShocks
              ? `Shock · ${activeShocks.map((s) => s.shock_type).join(', ')}`
              : 'No shocks'}
          </div>
        </div>
      </div>
    </header>
  )
}
