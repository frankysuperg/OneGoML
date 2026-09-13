import { useEffect } from 'react'
import { useShiftStore } from '../store/shiftStore'
import type { SimSpeed } from '../store/types'

const SPEEDS: SimSpeed[] = [1, 2, 4, 8]

export function ReplayControls() {
  const status = useShiftStore((s) => s.status)
  const replayPlaying = useShiftStore((s) => s.replayPlaying)
  const replayCursor = useShiftStore((s) => s.replayCursor)
  const replayLog = useShiftStore((s) => s.replayLog)
  const speed = useShiftStore((s) => s.speed)
  const replayResume = useShiftStore((s) => s.replayResume)
  const replayPause = useShiftStore((s) => s.replayPause)
  const replayTick = useShiftStore((s) => s.replayTick)
  const exitReplay = useShiftStore((s) => s.exitReplay)
  const setSpeed = useShiftStore((s) => s.setSpeed)

  const total = replayLog?.length ?? 0
  const atEnd = replayCursor >= total
  const progress = total > 0 ? Math.round((replayCursor / total) * 100) : 0

  // Drive replay playback via interval
  useEffect(() => {
    if (status !== 'Replay' || !replayPlaying) return
    const id = window.setInterval(replayTick, Math.max(80, 800 / speed))
    return () => window.clearInterval(id)
  }, [status, replayPlaying, speed, replayTick])

  if (status !== 'Replay') return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Replay label */}
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-orange-700">
        Replay
      </span>

      {/* Play / Pause */}
      {replayPlaying ? (
        <button
          type="button"
          onClick={replayPause}
          disabled={atEnd}
          className="rounded border border-orange-300 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-900 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Pause
        </button>
      ) : (
        <button
          type="button"
          onClick={replayResume}
          disabled={atEnd}
          className="rounded border border-orange-300 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-900 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {atEnd ? 'Done' : 'Play'}
        </button>
      )}

      {/* Speed selector */}
      <div className="flex items-center gap-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={`rounded px-1.5 py-1 text-[11px] font-semibold tabular-nums ${
              speed === s
                ? 'bg-orange-700 text-white'
                : 'border border-orange-200 bg-white text-orange-800 hover:bg-orange-50'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* Progress indicator */}
      <span className="ml-1 text-[10px] tabular-nums text-orange-700">
        {replayCursor}/{total} ({progress}%)
      </span>

      {/* Exit Replay */}
      <button
        type="button"
        onClick={exitReplay}
        className="ml-2 rounded border border-neutral-400 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-800 hover:bg-neutral-50"
      >
        Exit Replay
      </button>
    </div>
  )
}
