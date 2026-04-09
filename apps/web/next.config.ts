import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@adors/shared'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
}

export default nextConfig
