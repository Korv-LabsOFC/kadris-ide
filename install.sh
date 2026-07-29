#!/bin/sh

set -eu

fail() {
  printf '%s\n' "Kadris installer: $*" >&2
  exit 1
}

is_proot=false
if [ -n "${PROOT_DISTRO-}" ] || [ -n "${PROOT_TMP_DIR-}" ]; then
  is_proot=true
fi
case ${LD_PRELOAD-} in
  *[Pp][Rr][Oo][Oo][Tt]*) is_proot=true ;;
esac

if [ "$is_proot" = true ]; then
  fail "PRoot is not supported. Exit the PRoot distribution and use native Termux instead."
fi

system=$(uname -s 2>/dev/null || printf '%s' unknown)
is_termux=false
if [ -n "${TERMUX_VERSION-}" ]; then
  is_termux=true
fi
case ${PREFIX-}:${HOME-} in
  *com.termux*) is_termux=true ;;
esac

if [ "$is_termux" = true ]; then
  environment='native Termux (not officially verified on a real Android device)'
elif [ "$system" = Linux ]; then
  environment='native Linux'
else
  fail "unsupported environment: $system (this installer supports native Linux and native Termux)"
fi

command -v node >/dev/null 2>&1 || fail "Node.js 22.12.0 or newer is required; install it separately"
node -e '
const [major = 0, minor = 0] = process.versions.node.split(".").map(Number)
if (major < 22 || (major === 22 && minor < 12)) process.exit(1)
' >/dev/null 2>&1 || fail "Node.js 22.12.0 or newer is required (found $(node --version 2>/dev/null || printf '%s' unknown))"

if command -v npm >/dev/null 2>&1; then
  manager=npm
elif command -v pnpm >/dev/null 2>&1; then
  manager=pnpm
else
  fail "npm or pnpm is required; install one separately"
fi

package_name=${KADRIS_PACKAGE:-kadris}
case $package_name in
  '') fail "KADRIS_PACKAGE must not be empty" ;;
  -*) fail "KADRIS_PACKAGE must not begin with '-'" ;;
esac

printf '%s\n' "Environment: $environment"
printf '%s\n' "Installing $package_name with $manager without elevated privileges..."

if [ "$manager" = npm ]; then
  ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --global "$package_name"
else
  ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm add --global "$package_name"
fi

command -v kadris >/dev/null 2>&1 || fail "installation completed but kadris is not on PATH; check the global $manager binary directory"
kadris --version >/dev/null 2>&1 || fail "kadris --version failed"

printf '%s\n' "Installed successfully: $(kadris --version)"
