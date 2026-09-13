import { useEffect, useRef, useState } from 'react'
import { formatKm, formatMxn, formatMxnPerHour } from '../lib/formatMetrics'
import { formatRemaining } from '../lib/formatTime'
import { useShiftStore } from '../store/shiftStore'
import type { AgentEconomics } from './AgentPanel'

interface EarningsCounterProps {
  economics: AgentEconomics
}

function useAnimatedNumber(target: number, ms = 450): number {
  const [value, setValue] = useState(target)
  const displayed = useRef(target)

  useEffect(() => {
    const from = displayed.current
    const t0 = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms)
      const next = from + (target - from) * t
      displayed.current = next
      setValue(next)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, ms])

  return value
}

export function EarningsCounter({ economics }: EarningsCounterProps) {
  const remaining = useShiftStore((s) =>
    formatRemaining(s.simTime, s.shiftEndTime),
  )
  const animatedEarnings = useAnimatedNumber(economics.earningsMxn)
  const animatedRate = useAnimatedNumber(economics.mxnPerHour)
  const prev = useRef(economics.mxnPerHour)
  const [bump, setBump] = useState(false)

  useEffect(() => {
    if (prev.current === economics.mxnPerHour) return
    prev.current = economics.mxnPerHour
    setBump(true)
    const id = window.setTimeout(() => setBump(false), 380)
    return () => window.clearTimeout(id)
  }, [economics.mxnPerHour])

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        Rate
      </p>
      <p
        className={`mt-1 inline-block rounded px-2 py-0.5 text-2xl font-bold tabular-nums text-neutral-950 transition-transform duration-300 ${
          bump ? 'scale-105' : 'scale-100'
        }`}
        style={{ backgroundColor: '#fbf546' }}
      >
        {formatMxnPerHour(animatedRate)}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-neutral-500">
            Total Earnings
          </dt>
          <dd className="font-semibold tabular-nums text-neutral-950">
            {formatMxn(animatedEarnings, 1)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-neutral-500">
            Completed
          </dt>
          <dd className="font-semibold tabular-nums text-neutral-950">
            {economics.ordersCompleted}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-neutral-500">
            Accepted / skipped
          </dt>
          <dd className="font-semibold tabular-nums text-neutral-950">
            {economics.ordersAccepted}/{economics.ordersRejected}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-neutral-500">
            Distance
          </dt>
          <dd className="font-semibold tabular-nums text-neutral-950">
            {formatKm(economics.distanceKm)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10px] uppercase tracking-wide text-neutral-500">
            Time remaining
          </dt>
          <dd className="font-semibold tabular-nums text-neutral-950">
            {remaining}
          </dd>
        </div>
      </dl>
    </div>
  )
}
