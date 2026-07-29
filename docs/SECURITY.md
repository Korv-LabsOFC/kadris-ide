# Security Model

## Scope

Kadris grants the selected workspace and terminal the authority of the local user. Its controls reduce renderer and browser exposure; they do not sandbox user-entered terminal commands or protect an unlocked account from its owner.

## Electron Controls

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true` are preserved.
- The renderer receives a frozen, narrow preload bridge instead of `ipcRenderer`, `require`, arbitrary channels, arbitrary shell executables, or generic filesystem access.
- IPC handlers validate the current main-frame sender, payload size, input schema, and output schema.
- Child windows are denied and top-level navigation is restricted to the packaged renderer or exact development origin.
- CSP is installed by the main process.
- Provider keys are encrypted with Electron `safeStorage`, persisted atomically with user-only permissions, and represented to the renderer only as saved/not-saved status.
- Linux `basic_text` and unknown secure-storage backends are rejected for provider keys.
- Configured Ollama endpoints must be credential-free HTTP(S) loopback origins without paths, queries, or fragments.

## Local Web Controls

- The listening host is restricted to exactly `127.0.0.1` or `localhost`; network-facing binds are rejected.
- Each server process creates a random 32-byte token. Protected requests accept it through bearer authorization, the session cookie, or the initial URL query.
- The session cookie is `HttpOnly`, `SameSite=Strict`, and scoped to `/`. Transport is plain HTTP because the server is loopback-only.
- Every request validates the exact `Host`; any supplied `Origin` must equal the local server origin.
- API access is limited to 240 requests per minute per remote address.
- Request bodies are bounded, WebSocket messages are schema-validated, and WebSocket payloads are capped at 16 KiB.
- Terminal WebSocket upgrades require the session token and the `/ws/platform` path.
- Responses set CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, and `Cache-Control: no-store`.
- Web mode does not persist provider credentials. `--safe-mode` disables terminal and agent routes.

The token-bearing URL, cookie, and bearer header are capabilities for the active process. Do not share them or expose browser debugging output containing them. Loopback binding limits network reachability but does not protect against other software already running as the same user.

## Filesystem Controls

- The workspace root is canonicalized and must be a directory.
- Workspace operations reject absolute relative-path inputs, lexical traversal, and symlink escapes.
- Creation and rename operations verify the canonical parent before mutation.
- File reads, directory results, HTTP bodies, and terminal requests have explicit bounds.
- Static web assets and live-preview assets are separately confined to canonical roots.
- Android local web mode blocks selected restricted storage paths.

## Known Limitations

- Native Termux behavior has not been tested on a real Android device and is not officially verified.
- PRoot is blocked rather than supported.
- Loopback HTTP has no TLS. The design relies on loopback confinement and the per-session token.
- A token appears in the initial browser URL before being moved into an `HttpOnly` cookie.
- Rate limiting is process-local and keyed by remote address.
- The terminal intentionally executes commands with the user's authority.
- A provider key typed into Electron exists transiently in the renderer before IPC encryption. `safeStorage` protects persisted ciphertext, not a compromised renderer, main process, or unlocked account.
- Application signing, notarization, and update delivery are not configured as verified release services.
- No npm publication or GitHub release has occurred.

## Reporting

Do not put credentials, session-token URLs, private workspace content, or exploit details into a public issue. No verified private security contact or repository advisory URL is documented yet. Maintainers should establish and verify a private reporting channel before public distribution.
