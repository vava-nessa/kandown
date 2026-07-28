import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { docsNav, flatDocs, findDoc } from '../../content/nav'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const docsDir = path.resolve(__dirname, '../../content/docs')

describe('Documentation pages and navigation integrity', () => {
  it('should have a non-empty documentation navigation structure', () => {
    expect(docsNav.length).toBeGreaterThan(0)
    expect(flatDocs.length).toBeGreaterThan(0)
  })

  it('should include the introduction page in flatDocs and findDoc', () => {
    const introDoc = findDoc('introduction')
    expect(introDoc).toBeDefined()
    expect(introDoc?.title).toBe('Introduction')
    expect(introDoc?.slug).toBe('introduction')
  })

  it('should verify that every navigation slug maps to an existing .mdx file', () => {
    for (const item of flatDocs) {
      const filePath = path.join(docsDir, `${item.slug}.mdx`)
      expect(fs.existsSync(filePath), `Missing .mdx file for slug "${item.slug}" at ${filePath}`).toBe(true)
    }
  })

  it('should verify that all .mdx files contain valid frontmatter titles', () => {
    for (const item of flatDocs) {
      const filePath = path.join(docsDir, `${item.slug}.mdx`)
      const content = fs.readFileSync(filePath, 'utf-8')
      expect(content.startsWith('---'), `Doc "${item.slug}" missing YAML frontmatter header`).toBe(true)
      expect(content, `Doc "${item.slug}" missing title in frontmatter`).toMatch(/^title:\s*.+/m)
    }
  })

  it('should return undefined when findDoc is called with an invalid slug', () => {
    const invalidDoc = findDoc('non-existent-page-slug-xyz')
    expect(invalidDoc).toBeUndefined()
  })
})
