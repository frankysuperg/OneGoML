import type { ZoneCoordinates } from './types'

export const MTY_CENTER = { lat: 25.6866, lng: -100.3161 } as const

// TODO: reconciliar con el mapeo real zone_id -> barrio cuando el
// backend lo exponga — hoy no existe esa relación confirmada
export const KNOWN_ZONE_NAMES = [
  { name: 'San Pedro', lat: 25.6693, lng: -100.3100 },
  { name: 'Valle Oriente', lat: 25.6332, lng: -100.3117 },
  { name: 'Centro', lat: 25.6866, lng: -100.3161 },
  { name: 'Cumbres', lat: 25.7392, lng: -100.3942 },
  { name: 'Santa Catarina', lat: 25.6749, lng: -100.4489 },
  { name: 'García', lat: 25.7747, lng: -100.5558 },
] as const

/** Deterministic 32-bit mix from zoneId (same id → same offset forever). */
function mixZoneId(zoneId: number): number {
  let x = (zoneId | 0) * 2654435761
  x = (x ^ (x >>> 16)) >>> 0
  return x
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function nearestKnownName(lat: number, lng: number): string {
  let bestName: string = KNOWN_ZONE_NAMES[0].name
  let bestKm = Infinity
  for (const z of KNOWN_ZONE_NAMES) {
    const km = haversineKm({ lat, lng }, z)
    if (km < bestKm) {
      bestKm = km
      bestName = z.name
    }
  }
  return bestName
}

/**
 * Stable synthetic coordinates for a zone id around Monterrey Centro.
 * Radius ~0.05–0.15 degrees so distinct zones stay visually separable.
 */
export function getZoneCoordinates(zoneId: number): ZoneCoordinates {
  const h = mixZoneId(zoneId)
  const angle = ((h % 3600) / 3600) * Math.PI * 2
  const radiusDeg = 0.05 + ((h >>> 8) % 1001) / 1000 * 0.1

  const lat = MTY_CENTER.lat + Math.cos(angle) * radiusDeg
  const lng =
    MTY_CENTER.lng +
    (Math.sin(angle) * radiusDeg) /
      Math.cos((MTY_CENTER.lat * Math.PI) / 180)

  return {
    zoneId,
    name: nearestKnownName(lat, lng),
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  }
}
