# Packaging and Distribution

## Status

Distribution support is prepared but not live:

- The prepared source package and its executable command are named `kadris`.
- `package.json` currently has `private: true`, so npm publication is intentionally blocked.
- No npm publication has occurred.
- No GitHub release has occurred.
- Proposed repository URLs in package metadata have not been verified.
- This working directory has no `.git` directory.

Do not tell users to install from npm or download a release until those channels have been created and independently verified.

## Portable npm Package

The npm file list includes the built CLI, local server, shared modules, web application, installer, license, changelog, and docs. Electron is not the portable runtime: the CLI uses Electron only when a compatible desktop launch target is available and otherwise uses the local web server.

The package requires Node.js 22.12.0 or newer. `node-pty` is optional at package level but terminal support depends on an available compatible PTY implementation.

Prepare and inspect a tarball without publishing:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm pack --dry-run
npm pack
```

Inspect the reported file list and unpacked size. Test the resulting tarball in a clean, non-privileged environment before changing distribution metadata.

## Installer

`install.sh` is POSIX `sh` and intended for native Linux or native Termux. It:

- rejects PRoot indicators;
- requires Node.js 22.12.0 or newer;
- uses an existing npm or pnpm command;
- never invokes `sudo`, installs Node.js, or downloads Electron;
- installs `${KADRIS_PACKAGE:-kadris}` globally; and
- requires `kadris --version` to succeed.

Global package installation must already be configured for the current user. The script does not change ownership, package-manager prefixes, shell profiles, or system directories.

Native Termux support is a design target only. It has not been tested on a real Android device and must not be described as officially verified. PRoot is explicitly unsupported.

## Electron Targets

| Native host | Command | Configured artifacts |
| --- | --- | --- |
| Linux | `npm run package:linux` | AppImage and DEB |
| Windows | `npm run package:win` | NSIS installer |
| macOS | `npm run package:mac` | DMG and ZIP |

`node-pty` contains native code and must match the target operating system and architecture. Use native build hosts for release candidates and run the result on each target system. Cross-built archives or a successful builder exit are not runtime verification.

Artifacts are written under `dist/<os>-<arch>`. They are generated output and should not be edited manually.

## Signing

Configured packages are not signed or notarized by the repository workflows. Public Windows distribution needs an Authenticode identity. Public macOS distribution needs Developer ID signing and notarization. Credentials must remain in the release environment and must not be committed.

The application identifier is `com.kadris.ide`. Publisher metadata, ownership of the identifier, package name, repository location, support channels, and public URLs must be confirmed before the first release.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests with read-only repository permissions. It performs `npm ci`, type checking, linting, tests, all builds, an npm pack dry run, and CLI help/version/environment-diagnostic checks. It never publishes.

## npm Trusted Publishing

`.github/workflows/publish-npm.yml` runs only through `workflow_dispatch`. It has `contents: read` and job-scoped `id-token: write`, with no npm token placeholder. Before it can succeed:

1. Create and verify npm package ownership for `kadris`.
2. Configure npm trusted publishing for the exact repository owner, repository, workflow filename `publish-npm.yml`, and optional GitHub environment `npm`.
3. Protect the `npm` environment with required reviewers.
4. Replace unverified repository metadata and set `private: false` in a reviewed source change.
5. Run CI and test the exact tarball.
6. Manually dispatch with the required confirmation.

The workflow pins npm 11.5.1 for OIDC support and validates the package name, version, clean version format, and non-private state before `npm publish --provenance`. Publishing is never triggered by a push, pull request, tag, or release event.

## Draft Releases

`.github/workflows/release.yml` is manual and accepts an existing tag. It builds on native Linux, Windows, and macOS runners, uploads configured installers, and creates a draft GitHub release only after an explicit confirmation phrase. The draft must be inspected, signed where required, run on target systems, and consciously published by a maintainer.

Creating or running these workflows does not prove that the proposed repository URL, npm package page, artifacts, or update path work.
