import type { ExplainDecisionResponse, AIDecisionExplanation } from '../types'

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

/**
 * On-demand AI explanation requesting Gemini or Local AI explainer.
 */
export async function explainDecisionAI(
  orderId: string,
  apiKey?: string,
  forceLocal?: boolean,
): Promise<AIDecisionExplanation> {
  const url = `${API_BASE}/explain_ai`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: orderId,
      api_key: apiKey || null,
      force_local: !!forceLocal,
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`POST /explain_ai failed (${res.status}): ${err}`)
  }

  return (await res.json()) as AIDecisionExplanation
}

/**
 * Fetch Gemini API key status from backend.
 */
export async function getGeminiKeyStatus(): Promise<{ configured: boolean; masked_key?: string }> {
  try {
    const res = await fetch(`${API_BASE}/config/gemini_key`)
    if (!res.ok) return { configured: false }
    return await res.json()
  } catch {
    return { configured: false }
  }
}

/**
 * Persist Gemini API key to backend and .env file.
 */
export async function setGeminiKeyApi(
  apiKey: string,
): Promise<{ status: string; configured: boolean; masked_key?: string }> {
  const res = await fetch(`${API_BASE}/config/gemini_key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Error al guardar API key (${res.status}): ${err}`)
  }
  return await res.json()
}
