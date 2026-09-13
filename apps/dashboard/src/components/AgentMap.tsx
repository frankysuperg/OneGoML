import { useCallback, useMemo, type CSSProperties } from 'react'
import { GoogleMap, Marker } from '@react-google-maps/api'
import { getZoneCoordinates } from '../lib/geo'
import { useGoogleMaps } from './GoogleMapsProvider'

export interface AgentMapProps {
  currentZoneId: number
  pickupZoneId?: number
  dropoffZoneId?: number
}

const MAP_CONTAINER_STYLE: CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: '10rem',
}

const MAP_OPTIONS = {
  disableDefaultUI: true,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  clickableIcons: false,
  gestureHandling: 'greedy',
} as const

function MapFallback({ message }: { message: string }) {
  return (
    <div
      className="flex h-full min-h-[10rem] items-center justify-center rounded border border-neutral-200 bg-neutral-50 px-3 text-center text-xs text-neutral-600"
      role="alert"
    >
      {message}
    </div>
  )
}

export function AgentMap({
  currentZoneId,
  pickupZoneId,
  dropoffZoneId,
}: AgentMapProps) {
  const { isConfigured, isLoaded, loadError } = useGoogleMaps()

  const current = useMemo(
    () => getZoneCoordinates(currentZoneId),
    [currentZoneId],
  )
  const pickup = useMemo(
    () =>
      pickupZoneId !== undefined
        ? getZoneCoordinates(pickupZoneId)
        : undefined,
    [pickupZoneId],
  )
  const dropoff = useMemo(
    () =>
      dropoffZoneId !== undefined
        ? getZoneCoordinates(dropoffZoneId)
        : undefined,
    [dropoffZoneId],
  )

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      const points = [current, pickup, dropoff].filter(
        (p): p is NonNullable<typeof p> => p !== undefined,
      )
      if (points.length <= 1) {
        map.setCenter({ lat: current.lat, lng: current.lng })
        map.setZoom(13)
        return
      }
      const bounds = new google.maps.LatLngBounds()
      for (const p of points) {
        bounds.extend({ lat: p.lat, lng: p.lng })
      }
      map.fitBounds(bounds, 48)
    },
    [current, pickup, dropoff],
  )

  if (!isConfigured) {
    return <MapFallback message="Google Maps no configurado" />
  }

  if (loadError) {
    return (
      <MapFallback message="Google Maps no configurado — error al cargar el script" />
    )
  }

  if (!isLoaded) {
    return <MapFallback message="Cargando mapa…" />
  }

  return (
    <div className="relative h-full min-h-[10rem] overflow-hidden rounded border border-neutral-200">
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        center={{ lat: current.lat, lng: current.lng }}
        zoom={13}
        options={MAP_OPTIONS}
        onLoad={onLoad}
      >
        <Marker
          position={{ lat: current.lat, lng: current.lng }}
          title={`Courier · zone ${current.zoneId}${current.name ? ` · near ${current.name}` : ''}`}
          label={{ text: 'C', color: '#0a0a0a', fontWeight: '700' }}
        />
        {pickup ? (
          <Marker
            position={{ lat: pickup.lat, lng: pickup.lng }}
            title={`Pickup · zone ${pickup.zoneId}${pickup.name ? ` · near ${pickup.name}` : ''}`}
            label={{ text: 'P', color: '#0a0a0a', fontWeight: '700' }}
          />
        ) : null}
        {dropoff ? (
          <Marker
            position={{ lat: dropoff.lat, lng: dropoff.lng }}
            title={`Dropoff · zone ${dropoff.zoneId}${dropoff.name ? ` · near ${dropoff.name}` : ''}`}
            label={{ text: 'D', color: '#0a0a0a', fontWeight: '700' }}
          />
        ) : null}
      </GoogleMap>
      <p className="pointer-events-none absolute bottom-1 left-1 rounded border border-neutral-200 bg-white/95 px-1.5 py-0.5 text-[10px] font-medium text-neutral-800">
        z{current.zoneId}
        {current.name ? ` · ~${current.name}` : ''}
      </p>
    </div>
  )
}
