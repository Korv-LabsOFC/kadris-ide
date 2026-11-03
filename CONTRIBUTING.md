# Contributing

Thank you for your interest in contributing to Kadris. This project aims to be a secure, cross-platform hybrid IDE for developers on any device.

## Quick start

```bash
git clone https://github.com/Korv-LabsOFC/kadris-ide.git
cd kadris-ide
npm install
npm run typecheck
npm test
```

## Development

```bash
# Desktop (Electron)
npm run dev:desktop

# Local web (browser)
npm run dev:web

# CLI diagnostics
npm run dev:cli

# Build everything
npm run build
```

## Code conventions

- TypeScript strict, no `any`, no `@ts-ignore`
- Imports: external first, then internal with full path
- Components: function components with hooks, no classes
- State: React hooks + context, no external state library
- Tests: Vitest, collocated or in `tests/`
- Platform checks: use `PlatformBridge` shared contract, never `window.kadris` or `process.platform` directly in UI

## Pull request process

1. Create a feature branch from `main`
2. Run `npm run typecheck && npm run lint && npm test`
3. Run `npm run build` to confirm all targets build
4. Open a PR with a clear title and description
5. Wait for CI to pass

## Commit style

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add terminal multiplexer support
fix: correct path traversal in live-server
docs: update migration report
chore: bump monaco-editor to 0.55
```

## Code of conduct

All contributors must abide by our [Code of Conduct](CODE_OF_CONDUCT.md).
