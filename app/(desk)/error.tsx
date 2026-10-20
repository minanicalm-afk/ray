"use client"

import { btn } from "@/components/ui"

export default function DeskError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-3xl border border-line bg-panel p-6">
      <h1 className="font-serif text-3xl text-pine">Something went wrong</h1>
      <p className="mt-2 text-sm">The page could not be loaded. You can try again or go back to the dashboard.</p>
      <div className="mt-4 flex gap-2">
        <button className={btn.primary} onClick={() => reset()}>Try again</button>
        <a className={btn.ghost} href="/dashboard">Go to dashboard</a>
      </div>
    </div>
  )
}
