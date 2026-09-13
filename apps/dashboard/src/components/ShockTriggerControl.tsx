import type { ShockType } from '../types'
import { useShiftStore } from '../store/shiftStore'

const OPTIONS: { type: ShockType; label: string }[] = [
  { type: 'surge', label: 'Surge' },
  { type: 'closure', label: 'Road Closure' },
  { type: 'rain', label: 'Rain' },
  { type: 'delay', label: 'Delay' },
]

export function ShockTriggerControl() {
  const dispatchShock = useShiftStore((s) => s.dispatchShock)
  const active = useShiftStore((s) => s.activeShocks)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        Shock
      </span>
      {OPTIONS.map((opt) => {
        const on = active.some((s) => s.shock_type === opt.type)
        return (
          <button
            key={opt.type}
            type="button"
            onClick={() => dispatchShock(opt.type)}
            className={`rounded px-2 py-1 text-[11px] font-semibold ${
              on
                ? 'bg-neutral-950 text-white'
                : 'border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
