import { create } from 'zustand'
import {
  buildSeedLog,
  buildShiftEnd,
  buildShockEvent,
  explainForDecision,
  INITIAL_SIM_TIME,
  nextStepEvent,
  SHIFT_END_TIME,
  shockToActive,
  toEntry,
} from '../data/mockTimeline'
import { MOCK_EXPLANATIONS } from '../data/mockExplain'
import { addSimMinutes, simTimeMs } from '../lib/simTime'
import {
  SSEEventSource,
  injectShockApi,
  fetchStatusApi,
  type Unsubscribe,
} from '../data/eventStream'
import type { ExplainDecisionResponse, ShockType, SimulatorEvent } from '../types'
import type { ShiftSnapshot, SimSpeed, SimulationStatus } from './types'

const INITIAL: ShiftSnapshot = {
  status: 'Paused',
  simTime: INITIAL_SIM_TIME,
  shiftEndTime: SHIFT_END_TIME,
  shiftHours: 8,
  vehicle: 'moto',
  startLocationZone: 7,
  seed: 1,
  modelConnection: 'online',
  activeShocks: [
    { shock_type: 'surge', zone: 11, label: 'surge ×1.6 · z11' },
  ],
  speed: 1,
  events: buildSeedLog(),
  explanationsByOrderId: { ...MOCK_EXPLANATIONS },
  stepCursor: 0,
  replayLog: null,
  replaySeed: null,
  replayCursor: 0,
  replayPlaying: false,
}

function finishIfDue(simTime: string, shiftEndTime: string): boolean {
  return simTimeMs(simTime) >= simTimeMs(shiftEndTime)
}

interface ShiftStore extends ShiftSnapshot {
  setStatus: (status: SimulationStatus) => void
  setSpeed: (speed: SimSpeed) => void
  start: () => void
  pause: () => void
  resume: () => void
  restart: () => void
  tick: () => void
  step: () => void
  dispatchShock: (shockType: ShockType) => void
  syncStatus: () => Promise<void>
  /** Enter replay mode with a chronologically-ordered event array. */
  enterReplay: (log: SimulatorEvent[]) => void
  /** Exit replay and return to the live simulation state. */
  exitReplay: () => void
  /** Resume playback inside replay mode. */
  replayResume: () => void
  /** Pause playback inside replay mode. */
  replayPause: () => void
  /** Advance one event in the replay log (called by the interval). */
  replayTick: () => void
}

/** Snapshot of live-sim state saved before entering replay so we can restore it. */
let _liveSnapshot: ShiftSnapshot | null = null
let _streamUnsub: Unsubscribe | null = null

export const useShiftStore = create<ShiftStore>((set, get) => ({
  ...INITIAL,

  setStatus: (status) => set({ status }),
  setSpeed: (speed) => {
    set({ speed })
    // If running, restart stream to reflect new speed
    if (get().status === 'Running') {
      get().start()
    }
  },

  syncStatus: async () => {
    try {
      const data = await fetchStatusApi()
      if (data) {
        set({
          modelConnection: data.model_connection ?? 'online',
          vehicle: data.vehicle ?? get().vehicle,
        })
      }
    } catch {
      set({ modelConnection: 'offline' })
    }
  },

  start: () => {
    const { status, restart, seed, speed, vehicle } = get()
    if (status === 'Finished') {
      restart()
    }

    if (_streamUnsub) {
      _streamUnsub()
      _streamUnsub = null
    }

    set({ status: 'Running' })

    try {
      const source = new SSEEventSource({
        seed,
        speed,
        vehicle,
        onEnd: () => {
          set({ status: 'Finished' })
        },
        onError: () => {
          // Keep running, local ticks can take over if SSE drops
        },
      })

      _streamUnsub = source.subscribe((payload) => {
        const s = get()
        if (s.status !== 'Running' && s.status !== 'Finished') return

        const extra: Record<string, ExplainDecisionResponse> = {}
        if (payload.event === 'decision') {
          extra[payload.order_id] = explainForDecision(
            payload.order_id,
            payload.decision,
            payload.reason,
          )
        }

        const nextShocks =
          payload.event === 'shock'
            ? [
                ...s.activeShocks.filter(
                  (x) => x.shock_type !== payload.shock_type,
                ),
                shockToActive(payload),
              ]
            : s.activeShocks

        const nextEvents =
          payload.event === 'shift_start'
            ? [toEntry(payload)]
            : [toEntry(payload), ...s.events]

        set({
          simTime: payload.sim_time || s.simTime,
          events: nextEvents,
          explanationsByOrderId: { ...s.explanationsByOrderId, ...extra },
          activeShocks: nextShocks,
          status: payload.event === 'shift_end' ? 'Finished' : s.status,
        })
      })
    } catch {
      // Fallback
    }
  },

  pause: () => {
    if (_streamUnsub) {
      _streamUnsub()
      _streamUnsub = null
    }
    if (get().status === 'Running') set({ status: 'Paused' })
  },

  resume: () => {
    if (get().status === 'Paused') {
      get().start()
    }
  },

  restart: () => {
    if (_streamUnsub) {
      _streamUnsub()
      _streamUnsub = null
    }
    set({
      ...INITIAL,
      events: buildSeedLog(),
      explanationsByOrderId: { ...MOCK_EXPLANATIONS },
      status: 'Paused',
      simTime: INITIAL_SIM_TIME,
      speed: 1,
      stepCursor: 0,
      replayLog: null,
      replaySeed: null,
      replayCursor: 0,
      replayPlaying: false,
    })
  },

  tick: () => {
    const s = get()
    if (s.status !== 'Running') return
    // If backend SSE is streaming, simTime is updated by events;
    // this timer provides fallback clock advancement if no event arrives
    const next = addSimMinutes(s.simTime, 1)
    if (finishIfDue(next, s.shiftEndTime)) {
      const hasEnd = s.events.some((e) => e.payload.event === 'shift_end')
      set({
        simTime: s.shiftEndTime,
        status: 'Finished',
        events: hasEnd
          ? s.events
          : [toEntry(buildShiftEnd(s.shiftEndTime)), ...s.events],
      })
      return
    }
    set({ simTime: next })
  },

  step: () => {
    const s = get()
    if (s.status === 'Finished') return
    const nextTime = addSimMinutes(s.simTime, 1)
    if (finishIfDue(nextTime, s.shiftEndTime)) {
      const hasEnd = s.events.some((e) => e.payload.event === 'shift_end')
      set({
        simTime: s.shiftEndTime,
        status: 'Finished',
        events: hasEnd
          ? s.events
          : [toEntry(buildShiftEnd(s.shiftEndTime)), ...s.events],
      })
      return
    }
    const payload = nextStepEvent(s.stepCursor, nextTime)
    const extra: Record<string, ExplainDecisionResponse> = {}
    if (payload.event === 'decision') {
      extra[payload.order_id] = explainForDecision(
        payload.order_id,
        payload.decision,
        payload.reason,
      )
    }
    set({
      simTime: nextTime,
      stepCursor: s.stepCursor + 1,
      events: [toEntry(payload), ...s.events],
      explanationsByOrderId: { ...s.explanationsByOrderId, ...extra },
    })
  },

  dispatchShock: (shockType: ShockType) => {
    const s = get()
    const payload = buildShockEvent(s.simTime, shockType)
    const active = shockToActive(payload)

    // Optimistically update frontend store
    set({
      activeShocks: [
        ...s.activeShocks.filter((x) => x.shock_type !== shockType),
        active,
      ],
      events: [toEntry(payload), ...s.events],
    })

    // Notify backend
    injectShockApi({
      shock_type: shockType,
      zone: payload.zone ?? 11,
      multiplier: payload.multiplier,
      road: payload.road,
      duration_min: payload.duration_min,
    }).catch(() => {
      // Backend not running, local shock was applied
    })
  },

  enterReplay: (log: SimulatorEvent[]) => {
    const s = get()
    if (_streamUnsub) {
      _streamUnsub()
      _streamUnsub = null
    }

    // Save current live state so exitReplay can restore it exactly
    _liveSnapshot = {
      status: s.status,
      simTime: s.simTime,
      shiftEndTime: s.shiftEndTime,
      shiftHours: s.shiftHours,
      vehicle: s.vehicle,
      startLocationZone: s.startLocationZone,
      seed: s.seed,
      modelConnection: s.modelConnection,
      activeShocks: s.activeShocks,
      speed: s.speed,
      events: s.events,
      explanationsByOrderId: s.explanationsByOrderId,
      stepCursor: s.stepCursor,
      replayLog: null,
      replaySeed: null,
      replayCursor: 0,
      replayPlaying: false,
    }

    const shiftStart = log.find((e) => e.event === 'shift_start')
    const replaySeed =
      shiftStart?.event === 'shift_start' ? shiftStart.seed : null

    set({
      status: 'Replay',
      replayLog: log,
      replaySeed,
      replayCursor: 0,
      replayPlaying: true,
      events: [],
      explanationsByOrderId: {},
      activeShocks: [],
      simTime: log[0]?.sim_time ?? INITIAL_SIM_TIME,
    })
  },

  exitReplay: () => {
    if (_liveSnapshot) {
      set({ ..._liveSnapshot })
      _liveSnapshot = null
    } else {
      set({
        ...INITIAL,
        events: buildSeedLog(),
        explanationsByOrderId: { ...MOCK_EXPLANATIONS },
        status: 'Paused',
      })
    }
  },

  replayResume: () => {
    if (get().status === 'Replay') set({ replayPlaying: true })
  },

  replayPause: () => {
    if (get().status === 'Replay') set({ replayPlaying: false })
  },

  replayTick: () => {
    const s = get()
    if (s.status !== 'Replay' || !s.replayPlaying || !s.replayLog) return
    if (s.replayCursor >= s.replayLog.length) {
      set({ replayPlaying: false })
      return
    }

    const payload = s.replayLog[s.replayCursor]
    const extra: Record<string, ExplainDecisionResponse> = {}
    if (payload.event === 'decision') {
      extra[payload.order_id] = explainForDecision(
        payload.order_id,
        payload.decision,
        payload.reason,
      )
    }

    const nextShocks =
      payload.event === 'shock'
        ? [
            ...s.activeShocks.filter(
              (x) => x.shock_type !== payload.shock_type,
            ),
            shockToActive(payload),
          ]
        : s.activeShocks

    const isShiftEnd = payload.event === 'shift_end'

    set({
      simTime: payload.sim_time,
      replayCursor: s.replayCursor + 1,
      replayPlaying: isShiftEnd ? false : s.replayPlaying,
      events: [toEntry(payload), ...s.events],
      explanationsByOrderId: { ...s.explanationsByOrderId, ...extra },
      activeShocks: nextShocks,
    })
  },
}))
