import { execFile } from 'node:child_process'
import { readFile, opendir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import type { SearchInput, SearchResult } from '../../shared/search-contracts'

const MAX_FILE_BYTES = 512 * 1024
const SEARCH_TIMEOUT_MS = 15_000

export class SearchService {
  readonly #workspaceRoot: string

  constructor(workspaceRoot: string) {
    this.#workspaceRoot = workspaceRoot
  }

  async search(input: SearchInput): Promise<SearchResult> {
    const rg = this.#buildRipgrepArgs(input)
    if (rg) {
      try {
        return await this.#searchWithRipgrep(rg, input.maxResults)
      } catch { /* rg not found */ }
    }
    return this.#searchFallback(input)
  }

  #buildRipgrepArgs(input: SearchInput): string[] | null {
    try {
      const args: string[] = [
        '--json',
        '--max-count', '100',
        '--max-filesize', '512K',
        '--smart-case'
      ]
      if (!input.caseSensitive) args.push('--ignore-case')
      if (input.wholeWord) args.push('--word-regexp')
      if (!input.useRegex) args.push('--fixed-strings')
      if (input.includePattern) args.push('--glob', input.includePattern)
      if (input.excludePattern) args.push('--glob', `!${input.excludePattern}`)
      if (input.path) args.push('--glob', input.path)
      args.push('--', input.query, this.#workspaceRoot)
      return args
    } catch {
      return null
    }
  }

  #searchWithRipgrep(args: string[], maxResults: number): Promise<SearchResult> {
    return new Promise((resolvePromise, reject) => {
      execFile('rg', args, {
        cwd: this.#workspaceRoot,
        timeout: SEARCH_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024
      }, (error, stdout) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error('ripgrep not found'))
          return
        }
        try {
          const results: SearchResult['results'] = []
          for (const line of stdout.split('\n').filter(Boolean)) {
            const parsed = JSON.parse(line) as { type: string; data: { path: { text: string }; lines: { text: string }; line_number: number; absolute_offset: number; submatches: { match: { text: string }; start: number; end: number }[] } }
            if (parsed.type !== 'match') continue
            const data = parsed.data
            for (const submatch of data.submatches) {
              results.push({
                path: data.path.text,
                line: data.line_number,
                column: submatch.start,
                lineContent: data.lines.text.replace(/\n$/, ''),
                matchStart: submatch.start,
                matchEnd: submatch.end
              })
            }
          }
          const truncated = results.length > maxResults
          resolvePromise({
            results: results.slice(0, maxResults),
            totalMatches: results.length,
            truncated
          })
        } catch {
          reject(new Error('Failed to parse ripgrep output'))
        }
      })
    })
  }

  async #searchFallback(input: SearchInput): Promise<SearchResult> {
    const results: SearchResult['results'] = []
    const binaryExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.eot'])
    const excludeDirs = new Set(['node_modules', '.git', 'out', 'dist', 'coverage', '.cache'])

    const walkDir = async (dirPath: string): Promise<void> => {
      if (results.length >= input.maxResults) return
      let dir
      try {
        dir = await opendir(dirPath)
      } catch { return }
      for await (const entry of dir) {
        if (results.length >= input.maxResults) return
        if (excludeDirs.has(entry.name) || entry.name.startsWith('.')) continue
        const fullPath = join(dirPath, entry.name)
        if (entry.isDirectory()) {
          await walkDir(fullPath)
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase()
          if (binaryExts.has(ext)) continue
          try {
            const content = await readFile(fullPath, 'utf-8')
            if (content.length > MAX_FILE_BYTES) continue
            const lines = content.split('\n')
            const query = input.caseSensitive ? input.query : input.query.toLowerCase()
            for (let i = 0; i < lines.length; i++) {
              const lineContent = lines[i]!
              const searchIn = input.caseSensitive ? lineContent : lineContent.toLowerCase()
              let idx = 0
              while (idx < lineContent.length) {
                const found = input.useRegex ? SearchService.#matchRegex(searchIn, query, idx) : SearchService.#matchSimple(searchIn, query, idx, input.wholeWord)
                if (found === -1) break
                results.push({
                  path: relative(this.#workspaceRoot, fullPath),
                  line: i + 1,
                  column: input.useRegex ? found : (input.caseSensitive ? lineContent.indexOf(query, idx) : lineContent.toLowerCase().indexOf(query.toLowerCase(), idx)),
                  lineContent,
                  matchStart: found,
                  matchEnd: found + query.length
                })
                idx = found + 1
                if (results.length >= input.maxResults) break
              }
            }
          } catch { /* binary or unreadable */ }
        }
      }
    }

    await walkDir(input.path ? join(this.#workspaceRoot, input.path) : this.#workspaceRoot)
    return { results, totalMatches: results.length, truncated: results.length >= input.maxResults }
  }

  static #matchSimple(text: string, query: string, start: number, wholeWord: boolean): number {
    const idx = text.indexOf(query, start)
    if (idx === -1) return -1
    if (!wholeWord) return idx
    const before = idx > 0 ? text[idx - 1]! : ' '
    const after = idx + query.length < text.length ? text[idx + query.length]! : ' '
    const isWord = /\W/.test(before) && /\W/.test(after)
    return isWord ? idx : SearchService.#matchSimple(text, query, idx + 1, wholeWord)
  }

  static #matchRegex(text: string, pattern: string, start: number): number {
    try {
      const regex = new RegExp(pattern, 'g')
      regex.lastIndex = start
      const match = regex.exec(text)
      return match ? match.index : -1
    } catch { return -1 }
  }
}
