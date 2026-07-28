import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const routesDir = path.resolve(__dirname, '../../routes')

describe('Website route definitions integrity', () => {
  const requiredRouteFiles = [
    'index.tsx',
    '__root.tsx',
    '404.tsx',
    'docs/route.tsx',
    'docs/index.tsx',
    'docs/$.tsx',
    'changelogs/route.tsx',
    'changelogs/index.tsx',
    'changelogs/$.tsx',
  ]

  for (const relPath of requiredRouteFiles) {
    it(`should verify route file exists and exports Route: ${relPath}`, () => {
      const fullPath = path.join(routesDir, relPath)
      expect(fs.existsSync(fullPath), `Route file missing: ${relPath}`).toBe(true)
      const content = fs.readFileSync(fullPath, 'utf-8')
      expect(content, `Route file ${relPath} missing Route export`).toMatch(/export const Route = (createFileRoute|createRootRoute)\(/)
    })
  }
})
