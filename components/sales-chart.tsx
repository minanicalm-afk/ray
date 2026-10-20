"use client"

import Link from "next/link"
import { useState, type MouseEvent } from "react"
import { qty } from "@/lib/format"

const colors = ["#17352b", "#a56b12", "#8c4a3a"]

export function SalesChart({
  span,
  days,
  series,
}: {
  span: "week" | "month"
  days: { key: string; label: string }[]
  series: { name: string; values: number[] }[]
}) {
  const [hover, setHover] = useState<number | null>(null)
  const width = 720
  const height = 300
  const pad = { top: 28, right: 16, bottom: 36, left: 44 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const peak = Math.max(0, ...series.flatMap((item) => item.values))
  const max = axisMax(peak)
  const groupW = innerW / Math.max(days.length, 1)
  const totals = series.map((item) => item.values.reduce((sum, value) => sum + value, 0))
  const total = totals.reduce((sum, value) => sum + value, 0)
  const title = span === "month" ? "Phones sold this month" : "Phones sold this week"
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const drawn = series.map((item, seriesIndex) => ({
    ...item,
    color: colors[seriesIndex % colors.length],
    points: days.map((day, index) => ({
      key: day.key,
      label: day.label,
      value: item.values[index] ?? 0,
      x: pad.left + index * groupW + groupW / 2,
      y: pad.top + innerH - (max === 0 ? 0 : ((item.values[index] ?? 0) / max) * innerH),
    })),
  }))
  const active = hover === null ? null : drawn[0]?.points[hover]

  function move(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * width
    const index = Math.round((x - pad.left - groupW / 2) / groupW)
    setHover(index >= 0 && index < days.length ? index : null)
  }

  return (
    <section className="rounded-3xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-ink/60">Phones sold each day. Hover a point to read that day.</p>
        </div>
        <div className="flex rounded-full border border-line p-1 text-sm">
          <Link className={span === "week" ? "rounded-full bg-pine px-3 py-1 text-paper" : "rounded-full px-3 py-1 text-ink/70"} href="/dashboard?chart=week">Week</Link>
          <Link className={span === "month" ? "rounded-full bg-pine px-3 py-1 text-paper" : "rounded-full px-3 py-1 text-ink/70"} href="/dashboard?chart=month">Month</Link>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-4 text-sm">
        {drawn.map((item, index) => (
          <p key={item.name} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: item.color }} />
            {item.name} <span className="num">{qty(totals[index] ?? 0)}</span>
          </p>
        ))}
        <p>Total <span className="num">{qty(total)}</span></p>
      </div>
      {total === 0 ? <p className="mt-6 text-sm text-ink/60">No phones sold in this {span} yet.</p> : null}
      <div className="relative mt-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={chartLabel(title, series, totals, peak, max)} onMouseMove={move} onMouseLeave={() => setHover(null)}>
          {ticks.map((tick) => {
            const y = pad.top + innerH - tick * innerH
            return (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#e4dccb" />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#1c1914" opacity="0.55">{Math.round(max * tick)}</text>
              </g>
            )
          })}
          {days.map((day, index) => {
            const x = pad.left + index * groupW + groupW / 2
            return (
              <g key={day.key}>
                <line x1={x} x2={x} y1={pad.top} y2={pad.top + innerH} stroke="#e4dccb" strokeOpacity={hover === index ? 0 : 0.7} />
                <text x={x} y={height - 10} textAnchor="middle" fontSize={span === "month" ? "10" : "11"} fill="#1c1914" opacity={hover === index ? 1 : 0.6}>{day.label}</text>
              </g>
            )
          })}
          {active ? <line x1={active.x} x2={active.x} y1={pad.top} y2={pad.top + innerH} stroke="#1c1914" strokeOpacity="0.35" /> : null}
          {drawn.map((item) => (
            <g key={item.name}>
              <polyline fill="none" stroke={item.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={item.points.map((point) => `${point.x},${point.y}`).join(" ")} />
              {item.points.map((point, index) => (
                <circle key={point.key} cx={point.x} cy={point.y} r={hover === index ? 7 : 4.5} fill={item.color} stroke="#fffdf8" strokeWidth={hover === index ? 3 : 2}>
                  <title>{`${item.name} · ${point.label}: ${qty(point.value)} phones`}</title>
                </circle>
              ))}
            </g>
          ))}
        </svg>
        {active && hover !== null ? (
          <div
            className="pointer-events-none absolute z-10 min-w-36 rounded-2xl border border-line bg-panel px-3 py-2 text-sm shadow-sm"
            style={{ left: `${(active.x / width) * 100}%`, top: 8, transform: hover > days.length * 0.65 ? "translateX(-110%)" : "translateX(12px)" }}
          >
            <p className="font-medium">{active.label}</p>
            {drawn.map((item) => (
              <p key={item.name} className="mt-1 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />{item.name}</span>
                <span className="num">{qty(item.points[hover]?.value ?? 0)}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function chartLabel(title: string, series: { name: string; values: number[] }[], totals: number[], peak: number, max: number) {
  const parts = series.map((item, index) => `${item.name} ${qty(totals[index] ?? 0)}`)
  return `${title}. ${parts.join(". ")}. Highest day ${qty(peak)} phones. Scale goes to ${qty(max)}.`
}

function axisMax(peak: number) {
  if (peak <= 0) return 10
  const padded = peak + Math.max(5, Math.ceil(peak * 0.25))
  const step = padded <= 40 ? 10 : padded <= 100 ? 20 : padded <= 400 ? 50 : 100
  return Math.ceil(padded / step) * step
}
