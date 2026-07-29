# Termux Path Validation Fix

## Root Cause

`src/local-server/index.ts` previously used `isAndroidRestricted()`, which rejected every path under `/data`, `/data/data`, `/data/user`, and `/data/user/0` using a broad prefix match. The check happened before `realpath()` and before any Termux-specific authorization. Therefore the legitimate Termux home, `/data/data/com.termux/files/home`, was rejected as if it belonged to another Android application.

## Replacement Policy

`src/local-server/android-path-policy.ts` now:

1. Uses the environment report to distinguish `native-termux`, `android-proot`, and non-Android runtimes.
2. Canonicalizes `$HOME`, the Kadris-owned temporary root, `$PREFIX`, explicitly authorized shared-storage roots, and the requested path with `realpath()`.
3. Uses `path.relative()` component-aware containment checks rather than prefix matching.
4. Allows only canonical descendants of the Termux home, Kadris-owned temporary root, or a caller-provided authorized shared-storage root.
5. Rejects `$PREFIX` as a workspace root unless it is independently authorized.
6. Rejects `Android/data` and `Android/obb`, including when an authorized shared-storage root contains them.
7. Rejects external symlink targets because authorization is applied after canonical resolution.

## Structured Denials

Local-server errors now return `error.code = "NOT_AUTHORIZED"` and a structured `error.pathCode` for Android path policy failures. The message includes the requested path, resolved path, and the authorized root list for the authenticated local caller.

Examples of `pathCode` values:

- `ANDROID_PATH_NOT_AUTHORIZED`
- `TERMUX_PREFIX_NOT_AUTHORIZED`
- `ANDROID_SHARED_PRIVATE_DATA_BLOCKED`
- `ANDROID_RUNTIME_BLOCKED`

## Reproduction Evidence

The development host is not Termux. Its real environment was recorded as:

```text
process.platform: linux
$HOME: /home/israelcapivara
$PREFIX: unset
realpath($HOME): /home/israelcapivara
EnvironmentDetector runtime: native-desktop
```

The policy tests use the real native-Termux layout values:

```text
$HOME:   /data/data/com.termux/files/home
$PREFIX: /data/data/com.termux/files/usr
```

They verify that `/data/data/com.termux/files/home` and its project descendants are permitted, without permitting `/data/data/com.outro.app` or `/data/user/0/com.outro.app`.

## Validation

- `tests/android-path-policy.test.ts`: 14 unit tests for Termux, symlinks, shared storage, PRoot, and Linux desktop.
- `tests/local-server.test.ts`: integration test verifies a Termux home is accepted and `$PREFIX` returns `TERMUX_PREFIX_NOT_AUTHORIZED` through HTTP.
- Typecheck, lint, full tests, all builds, tarball packaging, and isolated global npm installation pass.

## Remaining Requirement

This policy requires validation on a real Android device before Termux support can be described as verified.
