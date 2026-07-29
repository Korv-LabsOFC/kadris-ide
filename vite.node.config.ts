import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const external = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  'node-pty',
  'ws',
  'zod'
]

export default defineConfig({
  build: {
    target: 'node22',
    outDir: resolve('dist'),
    emptyOutDir: false,
    minify: false,
    ssr: true,
    rollupOptions: {
      input: {
        cli: resolve('src/cli/index.ts'),
        server: resolve('src/local-server/index.ts')
      },
      external,
      output: {
        format: 'es',
        entryFileNames: '[name]/index.js',
        chunkFileNames: 'shared/[name]-[hash].js'
      }
    }
  }
})
