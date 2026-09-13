import type { ExplainDecisionResponse } from '../types'

/**
 * Lookup explain_decision by order_id — not wired yet.
 * The dashboard modal is tested with in-memory ExplainDecisionResponse mocks.
 */
export async function explainDecision(
  _orderId: string,
): Promise<ExplainDecisionResponse> {
  throw new Error('not implemented — mock pendiente')
}
