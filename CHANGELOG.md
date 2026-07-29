# Changelog

All notable changes will be documented in this file.

The format follows Keep a Changelog. The project intends to use Semantic Versioning after public distribution begins.

## 1.0.1 (2026-07-29)

### Fixed

- CLI `--version` now reads dynamically from `package.json` instead of hardcoded `'0.1.0'.
- Installable via both npm and pnpm with no Electron dependency in the npm package.

## 1.0.0 (2026-07-29)

### Added

- Hybrid Electron and loopback-only local web runtimes using a shared React `PlatformBridge`.
- Environment-aware CLI with workspace, runtime, network, diagnostics, safe-mode, and session options.
- Local web session authentication, Host and Origin validation, CSP, rate limiting, workspace confinement, and authenticated terminal WebSocket transport.
- POSIX installer preparation for native Linux and native Termux with explicit PRoot rejection.
- CI, manually gated npm trusted-publishing, and manually gated draft release automation.
- Architecture, security, packaging, and issue-reporting documentation.
- Published to npm as `kadris@1.0.0`.
- GitHub repository: israelmarques1024-dotcom/kadris-ide.
- CONTRIBUTING.md, CODE_OF_CONDUCT.md, PR template, issue templates.
- AppImage (151 MB) and DEB (118 MB) Linux installers under dist/linux-x64/.
