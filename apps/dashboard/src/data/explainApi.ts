import type { ExplainDecisionResponse } from '../types'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

/**
 * Lookup explain_decision by order_id from backend log.
 */
export async function explainDecision(
  orderId: string,
): Promise<ExplainDecisionResponse> {
  const url = `${API_BASE}/explain_decision?order_id=${encodeURIComponent(orderId)}`
  const res = await fetch(url)

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`GET /explain_decision failed (${res.status}): ${err}`)
  }

  return (await res.json()) as ExplainDecisionResponse
}
