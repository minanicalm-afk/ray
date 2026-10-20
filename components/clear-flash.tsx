"use client"

import { useEffect } from "react"

export function ClearFlash() {
  useEffect(() => {
    document.cookie = "ray_flash=; path=/; max-age=0"
  }, [])
  return null
}
