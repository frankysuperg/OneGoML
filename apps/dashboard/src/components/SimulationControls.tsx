import { useEffect } from 'react'
import { useShiftStore } from '../store/shiftStore'
import type { SimSpeed } from '../store/types'

const SPEEDS: SimSpeed[] = [1, 2, 4, 8]

function Ctrl({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  )
}

export function SimulationControls() {
  const status = useShiftStore((s) => s.status)
  const speed = useShiftStore((s) => s.speed)
  const start = useShiftStore((s) => s.start)
  const pause = useShiftStore((s) => s.pause)
  const resume = useShiftStore((s) => s.resume)
  const restart = useShiftStore((s) => s.restart)
  const step = useShiftStore((s) => s.step)
  const tick = useShiftStore((s) => s.tick)
  const setSpeed = useShiftStore((s) => s.setSpeed)

  useEffect(() => {
    if (status !== 'Running') return
    const id = window.setInterval(tick, Math.max(80, 1000 / speed))
    return () => window.clearInterval(id)
  }, [status, speed, tick])

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        Sim
      </span>
      <Ctrl
        label="Start"
        onClick={start}
        disabled={status === 'Running'}
      />
      <Ctrl label="Pause" onClick={pause} disabled={status !== 'Running'} />
      <Ctrl label="Resume" onClick={resume} disabled={status !== 'Paused'} />
      <Ctrl label="Restart" onClick={restart} />
      <Ctrl label="Step" onClick={step} disabled={status === 'Finished'} />
      <div className="ml-1 flex items-center gap-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={`rounded px-1.5 py-1 text-[11px] font-semibold tabular-nums ${
              speed === s
                ? 'bg-neutral-950 text-white'
                : 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}
