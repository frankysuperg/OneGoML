// Zustand: store mínimo para el shell; el stream real lo alimentará después.
import { create } from 'zustand'
import type { ShiftSnapshot } from './types'

const MOCK_SHIFT: ShiftSnapshot = {
  status: 'Running',
  simTime: '2026-03-21T18:50:00',
  shiftEndTime: '2026-03-21T23:00:00',
  shiftHours: 8,
  vehicle: 'moto',
  startLocationZone: 7,
  seed: 1,
  modelConnection: 'online',
  activeShocks: [
    { shock_type: 'surge', zone: 11, label: 'surge ×1.6 · z11' },
  ],
}

interface ShiftStore extends ShiftSnapshot {
  // Placeholders for later stream-driven updates
  setStatus: (status: ShiftSnapshot['status']) => void
}

export const useShiftStore = create<ShiftStore>((set) => ({
  ...MOCK_SHIFT,
  setStatus: (status) => set({ status }),
}))
