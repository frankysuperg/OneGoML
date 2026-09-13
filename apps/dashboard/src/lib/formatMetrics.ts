export function formatMxn(n: number, digits = 0): string {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

export function formatMxnPerHour(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} MXN/h`
}

export function formatKm(n: number): string {
  return `${n.toFixed(1)} km`
}
