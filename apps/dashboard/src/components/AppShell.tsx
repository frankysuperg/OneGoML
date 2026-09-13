import type { ReactNode } from 'react'
import { GoogleMapsProvider } from './GoogleMapsProvider'
import { TopBar } from './TopBar'

interface AppShellProps {
  children?: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <GoogleMapsProvider>
      <div className="min-h-screen bg-[#fafafa] text-neutral-950">
        <TopBar />
        <main className="pt-14 min-h-[calc(100vh-3.5rem)]">{children}</main>
        {/* Footer opcional — vacío por ahora */}
        <footer className="border-t border-transparent" />
      </div>
    </GoogleMapsProvider>
  )
}
