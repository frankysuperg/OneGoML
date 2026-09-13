import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'

interface GoogleMapsContextValue {
  isConfigured: boolean
  isLoaded: boolean
  loadError: Error | undefined
}

const GoogleMapsContext = createContext<GoogleMapsContextValue | null>(null)

interface GoogleMapsProviderProps {
  children: ReactNode
}

function GoogleMapsLoader({
  apiKey,
  children,
}: {
  apiKey: string
  children: ReactNode
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'onego-google-maps',
    googleMapsApiKey: apiKey,
  })

  const value = useMemo<GoogleMapsContextValue>(
    () => ({ isConfigured: true, isLoaded, loadError }),
    [isLoaded, loadError],
  )

  return (
    <GoogleMapsContext.Provider value={value}>
      {children}
    </GoogleMapsContext.Provider>
  )
}

/**
 * Loads the Maps JS API once at AppShell level so both AgentMap instances share one script.
 * Key only from import.meta.env.VITE_GOOGLE_MAPS_API_KEY — never hardcoded.
 */
export function GoogleMapsProvider({ children }: GoogleMapsProviderProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  const isConfigured = Boolean(apiKey && apiKey.trim().length > 0)

  if (!isConfigured) {
    return (
      <GoogleMapsContext.Provider
        value={{
          isConfigured: false,
          isLoaded: false,
          loadError: new Error('Google Maps no configurado'),
        }}
      >
        {children}
      </GoogleMapsContext.Provider>
    )
  }

  return <GoogleMapsLoader apiKey={apiKey!}>{children}</GoogleMapsLoader>
}

export function useGoogleMaps(): GoogleMapsContextValue {
  const ctx = useContext(GoogleMapsContext)
  if (!ctx) {
    throw new Error('useGoogleMaps must be used within GoogleMapsProvider')
  }
  return ctx
}
