import { useCallback, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ExplainDecisionResponse } from '../types'
import { explainDecision, explainDecisionAI } from '../data/explainApi'

export interface ExplainDecisionModalProps {
  /** Current or historical payload — never read from "current order" state. */
  explanation: ExplainDecisionResponse | null
  open: boolean
  onClose: () => void
  onUpdateExplanation?: (updated: ExplainDecisionResponse) => void
}

/**
 * Local UI state only. Opening/closing must not touch the shift store
 * or pause the simulation clock.
 */
export function useExplainDecisionModal() {
  const [open, setOpen] = useState(false)
  const [explanation, setExplanation] =
    useState<ExplainDecisionResponse | null>(null)

  const openExplanation = useCallback(
    async (payload: ExplainDecisionResponse) => {
      setExplanation(payload)
      setOpen(true)

      // Asynchronously fetch live AI interpretation from backend if not present
      if (!payload.ai_explanation && payload.order_id) {
        try {
          const fresh = await explainDecision(payload.order_id)
          if (fresh && fresh.ai_explanation) {
            setExplanation((prev) =>
              prev && prev.order_id === payload.order_id ? fresh : prev,
            )
          }
        } catch {
          // Keep current payload if offline or mock
        }
      }
    },
    [],
  )

  const closeExplanation = useCallback(() => {
    setOpen(false)
  }, [])

  return { open, explanation, setExplanation, openExplanation, closeExplanation }
}

function formatLabel(key: string): string {
  return key.replace(/_/g, ' ')
}

function formatPrimitive(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '—'
  }
  if (typeof value === 'string') return value
  return String(value)
}

function InputRows({
  data,
  depth = 0,
}: {
  data: Record<string, unknown>
  depth?: number
}) {
  const entries = Object.entries(data)
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-500">No inputs recorded.</p>
  }

  return (
    <ul className="space-y-1.5">
      {entries.map(([key, value]) => {
        const isNested =
          value !== null && typeof value === 'object' && !Array.isArray(value)

        if (isNested) {
          return (
            <li key={key} style={{ paddingLeft: depth * 12 }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {formatLabel(key)}
              </p>
              <div className="mt-1 border-l border-neutral-200 pl-3">
                <InputRows
                  data={value as Record<string, unknown>}
                  depth={depth + 1}
                />
              </div>
            </li>
          )
        }

        if (Array.isArray(value)) {
          const hasObjects = value.some(
            (item) => item !== null && typeof item === 'object',
          )

          if (hasObjects) {
            return (
              <li key={key} style={{ paddingLeft: depth * 12 }}>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {formatLabel(key)}
                </p>
                <ul className="mt-1 space-y-2 border-l border-neutral-200 pl-3">
                  {value.map((item, i) =>
                    item !== null && typeof item === 'object' && !Array.isArray(item) ? (
                      <li key={i}>
                        <InputRows
                          data={item as Record<string, unknown>}
                          depth={depth + 1}
                        />
                      </li>
                    ) : (
                      <li key={i} className="text-sm text-neutral-950 tabular-nums">
                        {formatPrimitive(item)}
                      </li>
                    ),
                  )}
                </ul>
              </li>
            )
          }

          return (
            <li
              key={key}
              className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm"
              style={{ paddingLeft: depth * 12 }}
            >
              <span className="font-medium text-neutral-600">
                {formatLabel(key)}
              </span>
              <span className="text-neutral-950 tabular-nums">
                {value.length === 0
                  ? '[]'
                  : value.map((item) => formatPrimitive(item)).join(', ')}
              </span>
            </li>
          )
        }

        return (
          <li
            key={key}
            className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm"
            style={{ paddingLeft: depth * 12 }}
          >
            <span className="font-medium text-neutral-600">
              {formatLabel(key)}
            </span>
            <span className="text-neutral-950 tabular-nums">
              {formatPrimitive(value)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function getVerdictBadge(category: string) {
  switch (category) {
    case 'ACEPTADA_ALTA_RENTABILIDAD':
      return {
        text: 'Aceptada · Alta Rentabilidad',
        style: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      }
    case 'RECHAZADA_TARIFA_INSUFICIENTE':
      return {
        text: 'Rechazada · Tarifa Insuficiente',
        style: 'bg-amber-100 text-amber-900 border-amber-300',
      }
    case 'RECHAZADA_CAPACIDAD_EXCEDIDA':
      return {
        text: 'Rechazada · Capacidad Excedida',
        style: 'bg-rose-100 text-rose-900 border-rose-300',
      }
    case 'RECHAZADA_RESTRICCION_SEGURIDAD':
      return {
        text: 'Rechazada · Candado de Seguridad',
        style: 'bg-red-100 text-red-900 border-red-300',
      }
    default:
      return {
        text: category.replace(/_/g, ' '),
        style: 'bg-neutral-100 text-neutral-800 border-neutral-300',
      }
  }
}

export function ExplainDecisionModal({
  explanation,
  open,
  onClose,
  onUpdateExplanation,
}: ExplainDecisionModalProps) {
  const titleId = useId()
  const [activeTab, setActiveTab] = useState<'ai' | 'inputs' | 'alternatives'>('ai')
  const [geminiKey, setGeminiKey] = useState(
    () => localStorage.getItem('GEMINI_API_KEY') || '',
  )
  const [isGeminiOpen, setIsGeminiOpen] = useState(false)
  const [loadingAi, setLoadingAi] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [currentExplanation, setCurrentExplanation] = useState<ExplainDecisionResponse | null>(
    explanation,
  )

  useEffect(() => {
    setCurrentExplanation(explanation)
    if (explanation?.ai_explanation) {
      setActiveTab('ai')
    }
  }, [explanation])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !currentExplanation) return null

  const isAccept = currentExplanation.decision === 'ACCEPT'
  const ai = currentExplanation.ai_explanation
  const verdict = ai ? getVerdictBadge(ai.verdict_category) : null

  const handleRequestGemini = async () => {
    if (!currentExplanation) return
    setLoadingAi(true)
    setAiError(null)
    try {
      const resAi = await explainDecisionAI(
        currentExplanation.order_id,
        geminiKey.trim() || undefined,
        false,
      )
      const updated: ExplainDecisionResponse = {
        ...currentExplanation,
        ai_explanation: resAi,
      }
      setCurrentExplanation(updated)
      onUpdateExplanation?.(updated)
      setActiveTab('ai')
    } catch (err: any) {
      setAiError(err.message || 'Error al invocar modelo de IA')
    } finally {
      setLoadingAi(false)
    }
  }

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-sm"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close explanation"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[101] flex max-h-[min(92vh,46rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl"
      >
        {/* Modal Header */}
        <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-3.5 bg-gradient-to-r from-neutral-50 to-white">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                <span className="text-xs">✨</span> Desglose de Decisión
              </span>
              <span className="font-mono text-xs font-semibold text-neutral-500">
                {currentExplanation.order_id}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md px-2.5 py-1 text-xs font-black uppercase tracking-wider ${
                  isAccept
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                    : 'bg-rose-600 text-white shadow-sm shadow-rose-200'
                }`}
              >
                {currentExplanation.decision}
              </span>
              <span className="text-sm font-medium text-neutral-800">
                {currentExplanation.reason}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            Cerrar
          </button>
        </header>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 bg-neutral-50/75 px-5">
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-all ${
              activeTab === 'ai'
                ? 'border-indigo-600 text-indigo-700 bg-white'
                : 'border-transparent text-neutral-600 hover:text-neutral-950'
            }`}
          >
            <span>🤖</span>
            <span>Interpretación de IA</span>
            {ai ? (
              <span className="ml-1 rounded-full bg-indigo-100 px-1.5 py-0.2 text-[10px] text-indigo-700 font-bold">
                Activo
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('inputs')}
            className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-all ${
              activeTab === 'inputs'
                ? 'border-indigo-600 text-indigo-700 bg-white'
                : 'border-transparent text-neutral-600 hover:text-neutral-950'
            }`}
          >
            <span>📋</span>
            <span>Entradas Numéricas (Inputs)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('alternatives')}
            className={`flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-all ${
              activeTab === 'alternatives'
                ? 'border-indigo-600 text-indigo-700 bg-white'
                : 'border-transparent text-neutral-600 hover:text-neutral-950'
            }`}
          >
            <span>⚖️</span>
            <span>Alternativas ({currentExplanation.alternatives_considered.length})</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
          {activeTab === 'ai' && (
            <div className="space-y-4">
              {ai ? (
                <>
                  {/* Badges Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-medium text-neutral-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {ai.provider === 'gemini' ? 'Google Gemini' : 'OneGoML Expert Engine'} ({ai.model_name})
                      </span>
                      <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-medium text-neutral-600">
                        🎯 {(ai.confidence_score * 100).toFixed(0)}% de confianza
                      </span>
                    </div>
                    {verdict ? (
                      <span
                        className={`rounded-md border px-2.5 py-1 text-xs font-bold ${verdict.style}`}
                      >
                        {verdict.text}
                      </span>
                    ) : null}
                  </div>

                  {/* Resumen Ejecutivo */}
                  <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-sky-50/50 p-4 shadow-sm">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-900 mb-1.5">
                      <span>💡</span> Resumen Ejecutivo de la IA
                    </h3>
                    <p className="text-sm leading-relaxed text-neutral-800">
                      {ai.executive_summary}
                    </p>
                  </div>

                  {/* Tarjetas de Métricas Económicas */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                      Desglose Económico y Operativo
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* Tarifa Proyectada vs Reserva */}
                      <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm hover:border-neutral-300 transition-all">
                        <p className="text-[10px] font-semibold uppercase text-neutral-500">
                          Tarifa Estimada
                        </p>
                        <p className="mt-1 font-mono text-xl font-bold text-neutral-900">
                          ${ai.financial_breakdown.projected_rate_mxn_hr.toFixed(0)}{' '}
                          <span className="text-xs font-normal text-neutral-500">MXN/h</span>
                        </p>
                        <div className="mt-1 flex items-center justify-between text-[11px]">
                          <span className="text-neutral-500">
                            Reserva: ${ai.financial_breakdown.reservation_wage_mxn_hr.toFixed(0)}
                          </span>
                          <span
                            className={`font-semibold ${
                              ai.financial_breakdown.rate_delta_mxn_hr >= 0
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {ai.financial_breakdown.rate_delta_mxn_hr >= 0 ? '+' : ''}
                            {ai.financial_breakdown.rate_delta_mxn_hr.toFixed(1)} MXN
                          </span>
                        </div>
                      </div>

                      {/* Ganancia Neta y Combustible */}
                      <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm hover:border-neutral-300 transition-all">
                        <p className="text-[10px] font-semibold uppercase text-neutral-500">
                          Paga Neta de Orden
                        </p>
                        <p className="mt-1 font-mono text-xl font-bold text-emerald-700">
                          ${ai.financial_breakdown.net_pay_mxn.toFixed(1)}{' '}
                          <span className="text-xs font-normal text-neutral-500">MXN</span>
                        </p>
                        <p className="mt-1 text-[11px] text-neutral-500 truncate">
                          Bruto: ${ai.financial_breakdown.gross_pay_mxn.toFixed(1)} · Gas: -${ai.financial_breakdown.estimated_fuel_cost_mxn.toFixed(1)}
                        </p>
                      </div>

                      {/* Traslado en Vacío (Deadhead) */}
                      <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm hover:border-neutral-300 transition-all">
                        <p className="text-[10px] font-semibold uppercase text-neutral-500">
                          Trayecto en Vacío (Deadhead)
                        </p>
                        <p className="mt-1 font-mono text-xl font-bold text-neutral-900">
                          {ai.financial_breakdown.deadhead_ratio_pct.toFixed(1)}%
                        </p>
                        <p className="mt-1 text-[11px] text-neutral-500">
                          Recogida: {ai.financial_breakdown.deadhead_km.toFixed(1)} km · Entrega: {ai.financial_breakdown.delivery_km.toFixed(1)} km
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Táctica Geoespacial y Seguridad */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Táctica Geoespacial */}
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                          🗺️ Corredor Geoespacial
                        </h4>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            ai.geospatial_tactics.relocation_quality === 'ALTA'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          Demanda Destino: {ai.geospatial_tactics.relocation_quality}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-neutral-900">
                        {ai.geospatial_tactics.pickup_zone} ➔ {ai.geospatial_tactics.dropoff_zone}
                      </p>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        {ai.geospatial_tactics.tactical_analysis}
                      </p>
                    </div>

                    {/* Candados de Seguridad */}
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                          🛡️ Candados de Seguridad
                        </h4>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            ai.safety_breakdown.passed_all_gates
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {ai.safety_breakdown.passed_all_gates
                            ? '5/5 Compuertas OK'
                            : `Falla: ${ai.safety_breakdown.binding_constraint}`}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-600 space-y-1">
                        <p>
                          <strong className="text-neutral-800">Carga:</strong>{' '}
                          {ai.safety_breakdown.weight_kg.toFixed(1)} kg / {ai.safety_breakdown.weight_limit_kg.toFixed(1)} kg máx
                        </p>
                        <p>
                          <strong className="text-neutral-800">Tráfico:</strong> Nivel {ai.safety_breakdown.traffic_level} ·{' '}
                          <strong className="text-neutral-800">Clima:</strong> Severidad {ai.safety_breakdown.weather_level}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Consejo Estratégico para el Repartidor */}
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 flex gap-2.5">
                    <span className="text-base shrink-0">🎯</span>
                    <div>
                      <h4 className="text-xs font-bold text-amber-950">
                        Consejo Estratégico para el Repartidor
                      </h4>
                      <p className="mt-0.5 text-xs leading-relaxed text-amber-900">
                        {ai.courier_recommendation}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center">
                  <span className="text-2xl">🤖</span>
                  <p className="mt-2 text-sm font-semibold text-neutral-800">
                    Generando desglose e interpretación de IA...
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    El copiloto inteligente analiza variables de rentabilidad, deadhead y compuertas de seguridad.
                  </p>
                </div>
              )}

              {/* Acordeón opcional para Google Gemini */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <button
                  type="button"
                  onClick={() => setIsGeminiOpen(!isGeminiOpen)}
                  className="flex w-full items-center justify-between text-xs font-semibold text-neutral-700 hover:text-neutral-950"
                >
                  <span className="flex items-center gap-1.5">
                    <span>⚡</span> Probar con Google Gemini (LLM en la nube)
                  </span>
                  <span className="text-neutral-400">{isGeminiOpen ? '▲ Ocultar' : '▼ Expandir'}</span>
                </button>

                {isGeminiOpen && (
                  <div className="mt-3 pt-3 border-t border-neutral-200 space-y-2.5">
                    <p className="text-xs text-neutral-600">
                      Por defecto, OneGoML ejecuta el intérprete local determinista (&lt;10ms, sin costo).
                      Si deseas probar el LLM Google Gemini en vivo, ingresa tu API Key a continuación:
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="GEMINI_API_KEY (opcional, o déjalo vacío si está en .env)"
                        value={geminiKey}
                        onChange={(e) => setGeminiKey(e.target.value)}
                        className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        disabled={loadingAi}
                        onClick={handleRequestGemini}
                        className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
                      >
                        {loadingAi ? 'Analizando...' : 'Interpretar con Gemini'}
                      </button>
                    </div>
                    {aiError && (
                      <p className="text-xs text-rose-600 font-medium">{aiError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'inputs' && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Variables de Entrada al Momento de la Decisión
              </h3>
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
                <InputRows data={currentExplanation.inputs} />
              </div>
            </section>
          )}

          {activeTab === 'alternatives' && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Alternativas de Decisión Consideradas
              </h3>
              {currentExplanation.alternatives_considered.length === 0 ? (
                <p className="text-sm text-neutral-500">Ninguna alternativa registrada.</p>
              ) : (
                <ul className="space-y-2.5">
                  {currentExplanation.alternatives_considered.map((alt, i) => (
                    <li
                      key={`${alt.option}-${i}`}
                      className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5"
                    >
                      <p className="text-sm font-bold text-neutral-900 flex items-center gap-1.5">
                        <span className="text-xs text-neutral-400">#{i + 1}</span> {alt.option}
                      </p>
                      <p className="mt-1 text-xs text-neutral-600 leading-relaxed">
                        <strong className="text-neutral-700">Razón de descarte:</strong>{' '}
                        {alt.rejected_because}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
