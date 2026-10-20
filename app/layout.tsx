import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Fraunces, IBM_Plex_Mono, Outfit } from "next/font/google"
import "./globals.css"

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" })
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" })
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex" })

export const metadata: Metadata = {
  title: "Ray",
  description: "Phone stock, sales and deposit cash across regions.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${fraunces.variable} ${plex.variable} antialiased`}>{children}</body>
    </html>
  )
}
