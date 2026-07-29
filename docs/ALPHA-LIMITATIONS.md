# Kadris Alpha Limitations

This document lists known limitations of the current alpha release.

## Platform Support

- **Linux Desktop**: primary target, validated in the development environment.
- **Web Local**: validated locally via browser.
- **Termux ARM64**: experimental, awaiting real Android device validation.
- **PRoot**: detection and blocking implemented, awaiting complete real-device validation.
- **Windows**: prepared but not verified on a real machine.
- **macOS**: not supported or not verified.

## Missing Features

- Git UI is intentionally basic: status, staging, commit, pull, push, branch status, and recent commits. Diff review, unstaging, branch management, merge conflict resolution, and remote configuration UI are absent.
- Global search supports text, case-sensitive, and regex search. Include/exclude controls and result navigation to an exact line are absent.
- LSP / diagnostics.
- Permission approvals are displayed as a simple modal and do not yet offer remembered decisions in the UI.
- Session restore currently restores only the active file, not multiple tabs, cursors, scroll positions, layout, or terminal state.
- Android Storage Access Framework (SAF).
- Android Bridge / companion app.
- Collaboration / multi-user.
- Extensions / plugin system.
- Debugger.
- Auto-update.
- Marketplace.

## Security

- Terminal and agent are disabled in `--safe-mode`.
- Credentials are not persisted in the web runtime.
- Network access is deliberately restricted to loopback only.
- Rate limiting is configured at 240 requests/minute.

## Performance

- Monaco Editor remains large (~979 KB gzipped) but is loaded only when a code file is opened. Monaco language workers can still be expensive on mobile devices.

## Known Risks

- Real compatibility of `node-pty` and Codex on Termux is unknown.
- TOCTOU in filesystem operations cannot be fully eliminated with Node.js APIs.
- Web runtime lacks secure API key persistence.
- Windows junctions not tested.
