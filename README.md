# Kadris




Kadris is a technical alpha IDE with a shared React interface for two local runtimes:

- Electron for supported desktop environments.
- A secure loopback-only web runtime for headless Linux, SSH, WSL, containers, and experimental Termux use.

It includes Monaco editing, a local terminal, file explorer, live preview, Git status/commit controls, global search, session restoration, optional Codex CLI integration, and a shared `PlatformBridge` between Electron and web runtimes.

## Alpha Status

**Current version: `0.1.0-alpha.0`.** This is not a stable or production release.

| Platform | Status |
| --- | --- |
| Linux Desktop | Validated in the project Linux environment |
| Web Local | Validated locally |
| Termux ARM64 | Experimental; requires a real Android-device test |
| Android PRoot | Blocked; use native Termux instead |
| Windows | Prepared, not verified on a real machine |
| macOS | Not verified |

See [Supported Platforms](docs/SUPPORTED-PLATFORMS.md) and [Alpha Limitations](docs/ALPHA-LIMITATIONS.md).

## Install

The alpha release is not published automatically. Until it is published, install a locally-built tarball:

```sh
npm pack
npm install --global ./kadris-0.1.0-alpha.0.tgz
kadris --version
```

When the owner publishes the alpha package, the intended command will be:

```sh
npm install --global kadris@alpha
```

The POSIX installer supports a known npm package or tarball:

```sh
KADRIS_PACKAGE=./kadris-0.1.0-alpha.0.tgz sh install.sh
```

The installer checks Node.js, detects native Termux and PRoot, rejects PRoot, skips Electron downloads, and verifies the installed CLI. It does not install Node.js or Electron.

## Development

Requirements: Node.js 22.12.0 or later and npm.

```sh
npm ci
npm run dev
```

Useful verification command:

```sh
npm run release:check
```

It runs environment checks, secret checks, typecheck, lint, tests, Web/CLI/server builds, CLI smoke tests, and `npm pack --dry-run`. It never publishes or pushes.

## CLI

```text
kadris [workspace] [options]
```

| Option | Behavior |
| --- | --- |
| `--web` | Force the local web runtime |
| `--desktop` | Require the Electron desktop runtime |
| `--port <number>` | Preferred local web port, default `4173` |
| `--host <host>` | Bind to `127.0.0.1` or `localhost` only |
| `--no-open` | Do not open a browser |
| `--diagnose-env` | Print environment classification |
| `--json` | Print diagnostics as JSON; requires `--diagnose-env` |
| `--safe-mode` | Disable terminal and agent routes in web mode |
| `--reset-session` | Reset saved session state |
| `--verbose` | Include non-sensitive environment evidence |

Examples:

```sh
kadris . --web --no-open
kadris /path/to/workspace --desktop
kadris --diagnose-env --json
```

## Security Model

- Web mode binds only to loopback.
- Each server process creates a 256-bit session token.
- API and WebSocket requests validate token, Host, and Origin.
- Responses use a restrictive Content Security Policy and defensive headers.
- Workspace access rejects absolute paths, traversal, and symlink escapes.
- `--safe-mode` disables terminal and Codex agent access in web mode.
- Codex integration is optional: Kadris launches the user-installed, user-authenticated Codex CLI and does not copy its credentials.

The session URL contains a bearer token. Do not share it.

## Repository

- Source: <https://github.com/karnel-termuxOFC/kadris-ide>
- Issues: <https://github.com/karnel-termuxOFC/kadris-ide/issues>
- Release readiness: [docs/ALPHA-READINESS-REPORT.md](docs/ALPHA-READINESS-REPORT.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT. See [LICENSE](LICENSE).

---

## KORV Labs

This project is part of the **KORV Labs** ecosystem — an independent technology lab building software, developer tools, and digital products.
