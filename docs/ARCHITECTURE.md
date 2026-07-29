# Architecture

## Overview

Kadris has two runtime adapters around one React interface:

```text
                         shared React renderer
                                  |
                           PlatformBridge
                           /            \
             frozen Electron API      WebPlatformBridge
                      |                    |
              preload and IPC      HTTP and WebSocket
                      |                    |
                Electron main       local Node server
                           \            /
                          workspace services
```

The `PlatformBridge` contract in `src/shared/contracts.ts` covers application metadata, workspaces, terminal sessions, provider settings, Codex operations, and live preview. The renderer obtains the Electron implementation from `window.kadris`; otherwise it constructs the web implementation. Components consume the bridge through React context rather than importing Electron or server APIs.

## Electron Runtime

- `src/main` owns application lifecycle, windows, filesystem authority, PTY processes, live preview, external tools, encrypted credentials, CSP, navigation policy, and final authorization.
- `src/preload` exposes a frozen and typed `window.kadris` bridge. Inputs and results are schema-validated and channels are fixed.
- `src/renderer` owns presentation and interaction. It has no direct Node.js or Electron access.
- `src/shared` owns serializable contracts, schemas, stable channel identifiers, and shared platform types.

Electron remains configured with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`. The main process checks that IPC originates from the current main frame at the allowed renderer URL.

## Local Web Runtime

The CLI starts a Node HTTP server serving the built React application and implementing the same bridge over local APIs. It accepts only `127.0.0.1` or `localhost`. The selected workspace is canonicalized before use.

The initial URL carries a random 32-byte per-session token. A successful token-bearing request sets an `HttpOnly`, `SameSite=Strict` cookie. API clients can also send the token as a bearer credential, and terminal WebSocket upgrades include it explicitly. Exact `Host` and, when present, `Origin` values must match the listening origin.

HTTP carries application, environment, workspace, file, live-preview, and Codex operations. An authenticated, schema-validated WebSocket carries terminal commands and terminal/Codex events. `--safe-mode` rejects terminal and agent operations. Secure provider credential storage and native dialogs are not exposed by the web bridge.

## Runtime Selection

The CLI classifies native desktop, headless, SSH, WSL, container, CI, native Termux, and Android PRoot signals. A compatible graphical desktop with Electron available selects Electron. Other permitted environments select local web mode. `--web` overrides selection toward web mode, while `--desktop` requires a compatible native desktop and Electron launch target.

Android PRoot is blocked. Native Termux is designed to use local web mode directly, but this path has not been tested on a real Android device and is not officially verified.

## Workspace Boundary

`WorkspaceService` stores a canonical root. Existing paths are resolved with `realpath`; lexical traversal, absolute relative-path inputs, and symlink escapes are rejected. Creation resolves and verifies the canonical parent directory. Directory results, file sizes, payloads, and terminal dimensions are bounded.

The web server also confines static assets to the canonical web root and live-preview assets to the selected preview directory. Android web mode rejects selected restricted storage areas.

## IPC Domains

| Domain | Transport | Purpose |
| --- | --- | --- |
| Application | IPC or HTTP | Runtime metadata |
| Workspace | IPC or HTTP | Select, inspect, read, create, save, rename, and delete confined entries |
| Terminal | IPC events or authenticated WebSocket | Control bounded local PTY sessions |
| Provider settings | Electron IPC only for persistence | Write-only encrypted API-key storage and loopback Ollama settings |
| Codex | IPC or HTTP/WebSocket | Status, login, run, cancellation, and events |
| Live preview | IPC or HTTP | Serve a selected workspace preview on loopback |

## Capability Differences

Electron provides native directory dialogs and `safeStorage`-backed credential persistence. Local web mode asks for a host-side path and reports secure credentials and native dialogs as unavailable. The common UI is expected to branch on bridge capabilities rather than infer behavior from the operating system.
