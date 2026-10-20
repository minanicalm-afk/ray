"use client"

import { btn } from "../ui"

export function Steps({ labels, step, onStep, atBottom = false }: { labels: string[]; step: number; onStep: (step: number) => void; atBottom?: boolean }) {
  return (
    <ol className={`${atBottom ? "mt-2" : "mb-6"} grid gap-2`} style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
      {labels.map((label, index) => {
        const done = index < step
        const current = index === step
        return (
          <li key={label}>
            <button
              type="button"
              disabled={index > step + 1}
              onClick={() => onStep(index)}
              className={`w-full rounded-2xl border px-2 py-3 text-left text-xs md:text-sm ${current ? "border-pine bg-pine text-paper" : done ? "border-line bg-panel" : "border-line bg-mist text-ink/40"}`}
            >
              <span className="num mr-1">{index + 1}</span>
              {label}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export function FlowNav({
  step,
  last,
  canNext,
  onBack,
  onNext,
  onDraft,
  onSubmit,
  pending,
  submitLabel,
  nextLabel = "Next",
}: {
  step: number
  last: boolean
  canNext: boolean
  onBack: () => void
  onNext: () => void
  onDraft: () => void
  onSubmit: () => void
  pending: boolean
  submitLabel: string
  nextLabel?: string
}) {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      <button type="button" className={btn.ghost} onClick={onBack} disabled={step === 0 || pending}>
        Back
      </button>
      <button type="button" className={btn.ghost} onClick={onDraft} disabled={pending}>
        Save draft
      </button>
      {last ? (
        <button type="button" className={btn.primary} onClick={onSubmit} disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      ) : (
        <button type="button" className={btn.primary} onClick={onNext} disabled={!canNext || pending}>
          {nextLabel}
        </button>
      )}
    </div>
  )
}

export function RemoveRow({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Remove row" onClick={onClick} className="grid h-10 w-10 place-items-center rounded-full text-clay hover:bg-clay-soft">
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
        <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </button>
  )
}

export function Missing({ items }: { items: string[] }) {
  if (!items.length) return null
  return <p className="mt-3 text-sm text-clay">Still needed: {items.join(", ")}.</p>
}
