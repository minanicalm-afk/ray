"use client"

import { useState } from "react"
import { btn } from "./ui"

export function ConfirmButton({
  action,
  message,
  children,
  fields,
  tone = "danger",
}: {
  action: (formData: FormData) => Promise<void>
  message: string
  children: React.ReactNode
  fields: Record<string, string>
  tone?: "danger" | "ghost"
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={tone === "danger" ? btn.danger : btn.ghost} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <form action={action} className="w-full max-w-md rounded-3xl bg-panel p-6 shadow-xl">
            {Object.entries(fields).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <h2 className="font-serif text-2xl text-pine">Please confirm</h2>
            <p className="mt-2 text-sm text-ink/80">{message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className={btn.danger}>Confirm</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}
