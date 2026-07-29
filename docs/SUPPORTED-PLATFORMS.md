# Supported Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| Linux (X11/Wayland) | Verified | Primary development target. Electron and Web runtimes validated. |
| Web Local (headless, SSH, WSL, containers) | Verified | CLI detects environment, starts local web server. |
| Termux (ARM64) | Experimental | Detection implemented. Requires real Android device validation before declaring official support. |
| Android PRoot | Blocked | Detection implemented. User is instructed to use native Termux. |
| Windows | Not verified | Electron build configured. CLI detects Windows. Awaiting real machine validation. |
| macOS | Not supported | Not verified, not configured for CI. |

## Runtime Decision Matrix

| Environment | Runtime |
|---|---|
| Windows (interactive) | Electron (when available) |
| Linux Desktop (interactive) | Electron (when available) |
| Termux native | Web Local |
| Android PRoot | Blocked |
| Linux headless | Web Local (no auto-open) |
| SSH | Web Local (no auto-open) |
| Docker / container | Web Local (no auto-open) |
| WSL | Web Local (no auto-open) |
| CI | No interface (unless flagged) |
| Unknown | Web safe or explicit error |
