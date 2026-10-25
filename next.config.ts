import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Don't block publishing or preview deploys on errors if the emitted JS is valid
  typescript: {
    ignoreBuildErrors: true,
  },
  // Prerender source maps add ~100 MB per static build worker
  enablePrerenderSourceMaps: false,
  experimental: {
    // Caps static build workers (~250-380 MB each) to lower `next build` peak memory
    cpus: 2,
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
