/** Format ISO sim_time for display (local wall-clock of the simulation). */
export function formatSimClock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/** Remaining shift duration from simTime → shiftEndTime. */
export function formatRemaining(simTime: string, shiftEndTime: string): string {
  const start = new Date(simTime).getTime()
  const end = new Date(shiftEndTime).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return '—'
  const ms = Math.max(0, end - start)
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

export function formatShiftDurationHours(hours: number): string {
  const whole = Math.floor(hours)
  const minutes = Math.round((hours - whole) * 60)
  if (minutes === 0) return `${whole}h`
  return `${whole}h ${minutes.toString().padStart(2, '0')}m`
}
