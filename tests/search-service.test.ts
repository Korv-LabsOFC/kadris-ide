import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SearchService } from '../src/main/services/search-service'
import type { SearchInput } from '../src/shared/search-contracts'

const temporaryPaths: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(temporaryPaths.splice(0).map(async (p) => rm(p, { recursive: true, force: true })))
})

async function createWorkspace(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kadris-search-test-'))
  temporaryPaths.push(dir)
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(dir, path)
    await mkdir(join(dir, ...path.split('/').slice(0, -1)), { recursive: true })
    await writeFile(fullPath, content)
  }
  return dir
}

function searchInput(overrides: Partial<SearchInput>): SearchInput {
  return {
    query: '', path: '', includePattern: '', excludePattern: '', maxResults: 200,
    caseSensitive: false, wholeWord: false, useRegex: false,
    ...overrides
  }
}

describe('SearchService', () => {
  it('finds a simple string match', async () => {
    const dir = await createWorkspace({ 'test.txt': 'hello world' })
    const svc = new SearchService(dir)
    const result = await svc.search(searchInput({ query: 'hello' }))
    expect(result.results.length).toBeGreaterThan(0)
    expect(result.results[0]!.lineContent).toContain('hello')
  })

  it('returns empty for no match', async () => {
    const dir = await createWorkspace({ 'test.txt': 'hello world' })
    const svc = new SearchService(dir)
    const result = await svc.search(searchInput({ query: 'zzzznotfound' }))
    expect(result.results).toHaveLength(0)
    expect(result.totalMatches).toBe(0)
  })

  it('searches in nested files', async () => {
    const dir = await createWorkspace({ 'src/index.ts': 'export const foo = 1' })
    const svc = new SearchService(dir)
    const result = await svc.search(searchInput({ query: 'foo' }))
    expect(result.results.length).toBeGreaterThan(0)
    expect(result.results[0]!.path).toContain('index.ts')
  })

  it('respects case sensitivity', async () => {
    const dir = await createWorkspace({ 'test.txt': 'Hello World' })
    const svc = new SearchService(dir)
    const insensitive = await svc.search(searchInput({ query: 'hello', caseSensitive: false }))
    expect(insensitive.results.length).toBeGreaterThan(0)
    const sensitive = await svc.search(searchInput({ query: 'hello', caseSensitive: true }))
    expect(sensitive.results).toHaveLength(0)
  })

  it('respects maxResults', async () => {
    const dir = await createWorkspace({
      'a.txt': 'match\n', 'b.txt': 'match\n', 'c.txt': 'match\n', 'd.txt': 'match\n', 'e.txt': 'match\n'
    })
    const svc = new SearchService(dir)
    const result = await svc.search(searchInput({ query: 'match', maxResults: 3 }))
    expect(result.results.length).toBeLessThanOrEqual(3)
    expect(result.truncated).toBe(true)
  })

  it('searches with regex', async () => {
    const dir = await createWorkspace({ 'test.txt': 'abc123def' })
    const svc = new SearchService(dir)
    const result = await svc.search(searchInput({ query: '\\d+', useRegex: true }))
    expect(result.results.length).toBeGreaterThan(0)
    expect(result.results[0]!.lineContent).toContain('123')
  })

  it('excludes node_modules by default', async () => {
    const dir = await createWorkspace({
      'test.txt': 'searchable',
      'node_modules/pkg/index.js': 'searchable'
    })
    const svc = new SearchService(dir)
    const result = await svc.search(searchInput({ query: 'searchable' }))
    const paths = result.results.map((r) => r.path)
    expect(paths).not.toContain('node_modules/pkg/index.js')
  })
})
