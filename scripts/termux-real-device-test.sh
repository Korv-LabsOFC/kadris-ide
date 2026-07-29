#!/usr/bin/env bash
# Kadris Termux Real Device Test
# Run this script on a real Android device running Termux.
set -euo pipefail

echo "=== Kadris Termux Real Device Test ==="
echo ""

# 1. Verify this is native Termux, not PRoot
if [ -n "${KADRIS_TEST_SKIP_ENV:-}" ]; then
  echo "[SKIP] Environment checks skipped (KADRIS_TEST_SKIP_ENV=1)"
else
  if [ ! -f /data/data/com.termux/files/usr/bin/termux-open-url ]; then
    echo "[FAIL] Not running in native Termux (termux-open-url not found)"
    exit 1
  fi
  echo "[PASS] Native Termux detected"

  if [ -n "${PROOT:-}" ] || [ -f /proot ]; then
    echo "[FAIL] Running inside PRoot — this test requires native Termux"
    exit 1
  fi
  echo "[PASS] Not inside PRoot"
fi

# 2. Show system info
echo ""
echo "--- System Information ---"
echo "Android: $(getprop ro.build.version.release 2>/dev/null || echo 'unknown')"
echo "Architecture: $(uname -m)"
echo "Termux: $(dpkg -l termux-tools 2>/dev/null | grep termux-tools | awk '{print $3}' || echo 'unknown')"
echo "Node: $(node --version 2>/dev/null || echo 'NOT FOUND')"
echo "npm: $(npm --version 2>/dev/null || echo 'NOT FOUND')"
echo "pnpm: $(pnpm --version 2>/dev/null || echo 'NOT FOUND')"

# 3. Check node version
if ! command -v node &>/dev/null; then
  echo "[FAIL] Node.js is not installed"
  exit 1
fi
echo "[PASS] Node.js found: $(node --version)"

# 4. Locate tarball
TARBALL="${1:-}"
if [ -z "$TARBALL" ]; then
  TARBALL="./kadris-*.tgz"
fi
echo ""
echo "--- Tarball ---"
LS_OUTPUT=$(ls $TARBALL 2>/dev/null || true)
if [ -z "$LS_OUTPUT" ]; then
  echo "[FAIL] Tarball not found: $TARBALL"
  echo "Usage: $0 <path-to-tarball>"
  exit 1
fi
TARBALL=$(echo "$LS_OUTPUT" | head -1)
echo "Using: $TARBALL"

# 5. Install globally
echo ""
echo "--- Installation ---"
npm install --global "$TARBALL" 2>&1
echo "[PASS] Installation completed"

# 6. CLI checks
echo ""
echo "--- CLI ---"
kadris --version
echo "[PASS] kadris --version"
kadris --help > /dev/null 2>&1
echo "[PASS] kadris --help"
DIAG=$(kadris --diagnose-env --json 2>/dev/null || true)
if echo "$DIAG" | grep -q "termux"; then
  echo "[PASS] Runtime detected as Termux"
else
  echo "[WARN] Runtime not detected as Termux: $(echo "$DIAG" | head -c 100)"
fi

# 7. Verify no Electron
echo ""
echo "--- Electron Check ---"
npm list -g kadris 2>/dev/null | grep -q electron && echo "[FAIL] Electron found in package" || echo "[PASS] No Electron in package"

# 8. Create temp workspace
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR; npm uninstall --global kadris 2>/dev/null || true" EXIT
echo "test content" > "$TEMP_DIR/test.js"

# 9. Start server
echo ""
echo "--- Server Test ---"
kadris "$TEMP_DIR" --no-open --port 43174 &
KADRIS_PID=$!
sleep 3

# 10. Health check
HEALTH=$(curl -s http://127.0.0.1:43174/api/health 2>/dev/null || true)
if echo "$HEALTH" | grep -q '"ok"'; then
  echo "[PASS] API health endpoint responds"
else
  echo "[FAIL] API health check failed: $HEALTH"
fi

# 11. File read
READ=$(curl -s -X POST http://127.0.0.1:43174/api/files/read \
  -H "Content-Type: application/json" \
  -d '{"relativePath":"test.js"}' 2>/dev/null || true)
if echo "$READ" | grep -q "test content"; then
  echo "[PASS] File read works"
else
  echo "[WARN] File read failed: $READ"
fi

# 12. Cleanup
kill $KADRIS_PID 2>/dev/null || true
sleep 1
if kill -0 $KADRIS_PID 2>/dev/null; then
  echo "[WARN] Process still running after SIGTERM"
  kill -9 $KADRIS_PID 2>/dev/null || true
else
  echo "[PASS] Process terminated cleanly"
fi

# 13. Orphan check
sleep 2
ORPHANS=$(ps aux | grep "kadris" | grep -v grep | head -3 || true)
if [ -z "$ORPHANS" ]; then
  echo "[PASS] No orphan processes"
else
  echo "[WARN] Possible orphan processes: $ORPHANS"
fi

echo ""
echo "=== Test Complete ==="
echo ""
echo "Manual checks required:"
echo "  - kadris --no-open  (start and open http://localhost:4173 in browser)"
echo "  - Monaco Editor loads and you can edit files"
echo "  - Terminal panel starts shell"
echo "  - Git operations work"
echo "  - Agent/Codex works (if configured)"
echo "  - Ctrl+C stops server, no orphan processes"
echo "  - Browser tab suspend/resume works"
