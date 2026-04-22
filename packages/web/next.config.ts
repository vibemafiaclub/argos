import path from 'node:path'
import type { NextConfig } from 'next'

// monorepo 루트에서 여러 lockfile 이 감지될 때 Next.js 가
// "inferred workspace root" 경고를 띄우는 것을 방지.
// packages/web 기준으로 2 단계 위가 pnpm workspace 루트.
const workspaceRoot = path.resolve(process.cwd(), '../..')

const config: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ['@argos/shared'],
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
}

export default config
