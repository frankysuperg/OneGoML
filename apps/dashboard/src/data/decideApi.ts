import type { DecideRequest, DecideResponse } from '../types'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

/**
 * POST /decide — calls the backend fast-path decision endpoint.
 */
export async function decide(request: DecideRequest): Promise<DecideResponse> {
  const url = `${API_BASE}/decide`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`POST /decide failed (${res.status}): ${errText}`)
  }

  return (await res.json()) as DecideResponse
}
