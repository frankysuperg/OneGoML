import { useState, useEffect } from 'react'
import { useShiftStore } from '../store/shiftStore'
import { toggleModelFailureApi } from '../data/eventStream'
import { getGeminiKeyStatus, setGeminiKeyApi } from '../data/explainApi'
import {
  formatRemaining,
  formatShiftDurationHours,
  formatSimClock,
} from '../lib/formatTime'
import type { ModelConnectionStatus, SimulationStatus } from '../store/types'

function statusClass(status: SimulationStatus): string {
  if (status === 'Running') return 'bg-neutral-950 text-white'
  if (status === 'Paused') return 'border border-neutral-950 bg-white text-neutral-950'
  if (status === 'Replay') return 'bg-orange-600 text-white'
  return 'border border-neutral-950/40 bg-white/80 text-neutral-700'
}

function connectionLabel(status: ModelConnectionStatus): string {
  if (status === 'online') return 'Model online'
  if (status === 'degraded') return 'Strategy degraded'
  return 'Model offline'
}

function connectionClass(status: ModelConnectionStatus): string {
  if (status === 'online') return 'text-emerald-800'
  if (status === 'degraded') return 'text-amber-900'
  return 'text-red-800'
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-neutral-800/70">
        {label}
      </span>
      <span className="text-sm font-semibold text-neutral-950 tabular-nums truncate">
        {value}
      </span>
    </div>
  )
}

export function TopBar() {
  const status = useShiftStore((s) => s.status)
  const simTime = useShiftStore((s) => s.simTime)
  const shiftEndTime = useShiftStore((s) => s.shiftEndTime)
  const shiftHours = useShiftStore((s) => s.shiftHours)
  const vehicle = useShiftStore((s) => s.vehicle)
  const startLocationZone = useShiftStore((s) => s.startLocationZone)
  const seed = useShiftStore((s) => s.seed)
  const replaySeed = useShiftStore((s) => s.replaySeed)
  const modelConnection = useShiftStore((s) => s.modelConnection)
  const activeShocks = useShiftStore((s) => s.activeShocks)

  const isReplay = status === 'Replay'
  const hasShocks = activeShocks.length > 0
  const displaySeed = isReplay && replaySeed != null ? replaySeed : seed

  const syncStatus = useShiftStore((s) => s.syncStatus)

  const [showGeminiModal, setShowGeminiModal] = useState(false)
  const [geminiKeyInput, setGeminiKeyInput] = useState(
    () => localStorage.getItem('GEMINI_API_KEY') || '',
  )
  const [geminiConfigured, setGeminiConfigured] = useState(false)
  const [maskedKey, setMaskedKey] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState(false)
  const [keyStatusMsg, setKeyStatusMsg] = useState<string | null>(null)

  useEffect(() => {
    getGeminiKeyStatus().then((res) => {
      setGeminiConfigured(res.configured)
      if (res.masked_key) setMaskedKey(res.masked_key)
    })
  }, [])

  const handleSaveGeminiKey = async () => {
    if (!geminiKeyInput.trim()) return
    setSavingKey(true)
    setKeyStatusMsg(null)
    try {
      const res = await setGeminiKeyApi(geminiKeyInput.trim())
      setGeminiConfigured(res.configured)
      if (res.masked_key) setMaskedKey(res.masked_key)
      localStorage.setItem('GEMINI_API_KEY', geminiKeyInput.trim())
      setKeyStatusMsg('¡API Key guardada exitosamente en .env y activa!')
      setTimeout(() => {
        setShowGeminiModal(false)
        setKeyStatusMsg(null)
      }, 1500)
    } catch (err: any) {
      setKeyStatusMsg(err.message || 'Error al guardar API Key')
    } finally {
      setSavingKey(false)
    }
  }

  const handleToggleModel = async () => {
    try {
      const next = modelConnection !== 'degraded'
      await toggleModelFailureApi(next)
      await syncStatus()
    } catch (err) {
      console.error('Failed to toggle model failure:', err)
    }
  }

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b bg-accent ${
        isReplay
          ? 'border-orange-500 border-b-2'
          : 'border-neutral-950/15'
      }`}
    >
      {/* Replay mode banner strip */}
      {isReplay && (
        <div className="flex items-center justify-center gap-2 bg-orange-600 px-4 py-0.5">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            ⏪ Replay mode — not live data
          </span>
        </div>
      )}

      <div className="flex h-14 items-center gap-4 px-4 overflow-x-auto">
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold tracking-tight text-neutral-950">
            OneGoML
          </span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusClass(status)}`}
          >
            {status}
          </span>
        </div>

        <div className="h-6 w-px shrink-0 bg-neutral-950/20" aria-hidden />

        <div className="flex items-center gap-5 shrink-0">
          <Meta label="Sim time" value={formatSimClock(simTime)} />
          {!isReplay && (
            <Meta
              label="Remaining"
              value={formatRemaining(simTime, shiftEndTime)}
            />
          )}
          <Meta
            label="Shift"
            value={isReplay ? 'Replay' : formatShiftDurationHours(shiftHours)}
          />
          <Meta label="Vehicle" value={vehicle} />
          <Meta label="Start zone" value={String(startLocationZone)} />
          <Meta
            label={isReplay ? 'Replay seed' : 'Seed'}
            value={String(displaySeed)}
          />
        </div>

        <div className="h-6 w-px shrink-0 bg-neutral-950/20" aria-hidden />

        <div className="flex items-center gap-4 shrink-0 ml-auto">
          {!isReplay && (
            <button
              type="button"
              onClick={handleToggleModel}
              title="Click to toggle Degraded Mode (Requirement 5 for judges)"
              className="flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-neutral-950/10 cursor-pointer"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  modelConnection === 'online'
                    ? 'bg-emerald-700'
                    : modelConnection === 'degraded'
                      ? 'bg-amber-800 animate-pulse'
                      : 'bg-red-800'
                }`}
                aria-hidden
              />
              <span
                className={`text-xs font-semibold ${connectionClass(modelConnection)}`}
              >
                {connectionLabel(modelConnection)}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGeminiModal(true)}
            title="Configurar Google Gemini API Key"
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
              geminiConfigured
                ? 'border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : 'border-indigo-400 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 shadow-sm'
            }`}
          >
            <span className="text-xs">✨</span>
            <span>{geminiConfigured ? `Gemini Activo (${maskedKey ?? 'OK'})` : 'Conectar Gemini'}</span>
          </button>

          <div
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold ${
              hasShocks
                ? isReplay
                  ? 'bg-orange-700 text-white'
                  : 'bg-neutral-950 text-white'
                : 'border border-neutral-950 bg-white text-neutral-700'
            }`}
            title={
              hasShocks
                ? activeShocks.map((s) => s.label).join(', ')
                : 'No active shocks'
            }
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                hasShocks ? 'bg-white' : 'bg-neutral-400'
              }`}
              aria-hidden
            />
            {hasShocks
              ? `Shock · ${activeShocks.map((s) => s.shock_type).join(', ')}`
              : 'No shocks'}
          </div>
        </div>
      </div>

      {/* Gemini API Key Configuration Modal */}
      {showGeminiModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-sm"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                  <span>✨</span> Google Gemini API
                </span>
                <h3 className="mt-1.5 text-base font-bold text-neutral-950">
                  Configurar API Key de Gemini
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGeminiModal(false)}
                className="rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Ingresa tu API Key para habilitar el modelo generativo de <strong>Google Gemini (gemini-2.0-flash)</strong> en el desglose explicativo de pedidos. Se guardará en tu archivo <code>.env</code> y en el navegador.
            </p>

            {geminiConfigured && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 flex items-center gap-2">
                <span>✅</span>
                <span>
                  Clave actualmente activa: <strong>{maskedKey ?? 'Configurada'}</strong>
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                Pega tu Gemini API Key
              </label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-sm text-neutral-900 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 font-mono"
              />
              <p className="text-[11px] text-neutral-500">
                ¿No tienes una clave? Consíguela gratis en{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-indigo-600 hover:underline"
                >
                  Google AI Studio ↗
                </a>
              </p>
            </div>

            {keyStatusMsg && (
              <p
                className={`text-xs font-semibold ${
                  keyStatusMsg.includes('exitosamente')
                    ? 'text-emerald-700'
                    : 'text-rose-700'
                }`}
              >
                {keyStatusMsg}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowGeminiModal(false)}
                className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingKey || !geminiKeyInput.trim()}
                onClick={handleSaveGeminiKey}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {savingKey ? 'Guardando...' : 'Guardar y Activar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
