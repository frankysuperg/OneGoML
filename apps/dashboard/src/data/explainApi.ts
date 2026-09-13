import type { ExplainDecisionResponse } from '../types'

/**
 * Lookup explain_decision by order_id — not wired yet.
 */
export async function explainDecision(
  _orderId: string,
): Promise<ExplainDecisionResponse> {
  throw new Error('not implemented — mock pendiente')
}
