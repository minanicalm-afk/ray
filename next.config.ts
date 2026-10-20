import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  outputFileTracingIncludes: {
    "/*": ["./data/seed.db"],
  },
}

export default nextConfig
