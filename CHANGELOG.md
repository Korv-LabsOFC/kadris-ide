# Changelog

All notable changes will be documented in this file.

The format follows Keep a Changelog. The project intends to use Semantic Versioning after public distribution begins.

## Unreleased

### Added

- Hybrid Electron and loopback-only local web runtimes using a shared React `PlatformBridge`.
- Environment-aware CLI with workspace, runtime, network, diagnostics, safe-mode, and session options.
- Local web session authentication, Host and Origin validation, CSP, rate limiting, workspace confinement, and authenticated terminal WebSocket transport.
- POSIX installer preparation for native Linux and native Termux with explicit PRoot rejection.
- CI, manually gated npm trusted-publishing preparation, and manually gated draft release automation.
- Architecture, security, packaging, and issue-reporting documentation.

### Distribution Status

- The source reports version `0.1.0`.
- No npm package has been published.
- No GitHub release has been created.
- Native Termux support has not been tested on a real Android device and is not officially verified.
