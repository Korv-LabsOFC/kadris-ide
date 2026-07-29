# Kadris

Kadris is an early hybrid development environment. It keeps the Electron desktop runtime and also provides a loopback-only local web runtime. Both runtimes render the same React interface through a shared `PlatformBridge` contract.

The prepared npm package name and installed command are both `kadris`.

## Distribution Status

Kadris has not been published to npm and no GitHub release has been created. Repository metadata contains proposed project URLs, but those URLs and release channels have not been verified. This working directory also has no `.git` directory.

The installer and workflows in this repository are distribution preparation, not evidence that a public package or release is available.

## Requirements

- Node.js 22.12.0 or newer.
- npm or pnpm.
- Native Linux for the prepared shell installer, including native Termux when detected.
- A graphical desktop and an available Electron package for desktop mode.

PRoot environments are blocked. The native Termux web-runtime design exists, but it has not been tested on a real Android device and is not officially verified.

## Install

Once `kadris` has actually been published, the prepared installer can install it globally:

```sh
sh install.sh
```

Override the package specification only when testing a known package or tarball:

```sh
KADRIS_PACKAGE=/path/to/kadris-0.1.0.tgz sh install.sh
```

The script detects native Termux, PRoot, and Linux; rejects PRoot; checks Node.js and the package manager; installs without `sudo`; skips Electron binary downloads; and verifies `kadris --version`. It does not install Node.js or Electron.

For source development:

```sh
npm ci
npm run dev
```

## CLI

```text
kadris [workspace] [options]
```

The workspace defaults to the current directory. Implemented options are:

| Option | Behavior |
| --- | --- |
| `--web` | Force the local web runtime |
| `--desktop` | Require the Electron desktop runtime |
| `--port <number>` | Prefer a port from 1 to 65535; default is 4173 |
| `--host <host>` | Bind to `127.0.0.1` or `localhost` only |
| `--no-open` | Do not open a browser |
| `--diagnose-env` | Print environment classification |
| `--json` | Print diagnostics as JSON; requires `--diagnose-env` |
| `--safe-mode` | Disable terminal and agent tools in local web mode |
| `--reset-session` | Remove the saved local session marker |
| `--verbose` | Include non-sensitive diagnostic evidence |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show the version |

Examples:

```sh
kadris . --web --no-open
kadris /path/to/workspace --desktop
kadris --diagnose-env --verbose
kadris --diagnose-env --json
```

The web server may try up to 20 subsequent ports when the preferred port is occupied. Its printed browser URL includes a per-session secret and should not be shared.

## Implemented Architecture

- Electron is preserved with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`.
- The desktop preload exposes a frozen, typed bridge while the web runtime implements the same `PlatformBridge` over local HTTP and WebSocket transports.
- The React renderer has no direct Node.js access.
- The local web server accepts only `127.0.0.1` or `localhost`, validates exact `Host` and `Origin` values, and requires a random per-session token.
- Web responses include CSP and other defensive headers, API requests are rate-limited, and terminal WebSocket upgrades are authenticated.
- Workspace operations canonicalize roots and reject absolute paths, traversal, and symlink escapes.
- Environment detection selects Electron or local web mode and blocks Android PRoot.

See `docs/ARCHITECTURE.md` and `docs/SECURITY.md` for boundaries and limitations.

## Current Capabilities

- Shared React workspace UI for Electron and local web operation.
- Workspace browsing and confined file read, create, save, rename, and delete operations.
- Text editing, bounded binary previews, terminal sessions, and a local live preview.
- Electron-only encrypted provider credential storage through `safeStorage`.
- Codex status, login, run, cancellation, and event surfaces when the external tool is available.
- Environment diagnostics and runtime selection for desktop, headless, SSH, WSL, container, CI, Termux, and PRoot signals.

Capabilities differ by runtime. The local web bridge does not provide native dialogs or secure provider credential persistence. `--safe-mode` disables its terminal and agent routes.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm pack --dry-run
node dist/cli/index.js --help
node dist/cli/index.js --version
node dist/cli/index.js --diagnose-env
```

Native desktop packaging commands are `npm run package:linux`, `npm run package:win`, and `npm run package:mac`. These do not publish. See `docs/PACKAGING.md` before producing or distributing artifacts.

## Privacy

Telemetry is not implemented. Electron provider keys are encrypted by `safeStorage` in the main process and are never returned to the renderer. The local web session token is a bearer capability for the running process; treat its URL and cookie as sensitive.

## License

MIT. See `LICENSE`.
