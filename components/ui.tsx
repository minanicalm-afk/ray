import type { ReactNode } from "react"
import Link from "next/link"
import { ClearFlash } from "./clear-flash"

export const btn = {
  primary:
    "inline-flex items-center justify-center rounded-full bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-pine-soft disabled:cursor-not-allowed disabled:opacity-40",
  gold: "inline-flex items-center justify-center rounded-full bg-gold px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40",
  ghost:
    "inline-flex items-center justify-center rounded-full border border-line bg-panel px-4 py-2 text-sm font-medium hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40",
  danger: "inline-flex items-center justify-center rounded-full bg-clay px-4 py-2 text-sm font-medium text-white hover:opacity-90",
  tiny: "inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-medium text-pine hover:bg-mist",
}

export const inputClass = "w-full rounded-xl border border-line bg-mist px-3 py-2 text-sm text-ink placeholder:text-ink/40"
export const badClass = "w-full rounded-xl border border-clay bg-clay-soft px-3 py-2 text-sm"

export function fieldClass(invalid: boolean) {
  return invalid ? badClass : inputClass
}

export function Banner({ type, message }: { type: "ok" | "err"; message: string }) {
  return (
    <p className={`mb-4 rounded-2xl px-4 py-3 text-sm ${type === "ok" ? "bg-moss/10 text-moss" : "bg-clay-soft text-clay"}`} role="status">
      <ClearFlash />
      {message}
    </p>
  )
}

export function PageHeader({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-3xl text-pine">{title}</h1>
        {text ? <p className="mt-1 max-w-2xl text-sm text-ink/70">{text}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-line bg-panel p-4">
      <p className="text-xs uppercase tracking-wide text-ink/50">{label}</p>
      <p className="num mt-2 text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink/60">{hint}</p> : null}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line bg-panel px-4 py-8 text-center text-sm text-ink/70">{children}</p>
}

export function Badge({ kind }: { kind: "New" | "Updated" | "Inactive" | "Pending" | "Submitted" }) {
  const tone =
    kind === "New" ? "bg-gold-soft text-gold" : kind === "Updated" ? "bg-pine/10 text-pine" : kind === "Pending" ? "bg-clay-soft text-clay" : kind === "Inactive" ? "bg-mist text-ink/60" : "bg-moss/10 text-moss"
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{kind}</span>
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium text-gold underline-offset-2 hover:underline">
      {children}
    </Link>
  )
}
