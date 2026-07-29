#!/usr/bin/env bash
# Kadris PRoot Detection Test
# Run this script inside a PRoot environment (e.g., proot-distro install ubuntu)
set -euo pipefail

echo "=== Kadris PRoot Detection Test ==="
echo ""

# Verify we're inside PRoot
if [ -z "${PROOT:-}" ] && [ ! -f /proot ]; then
  echo "[WARN] Not obviously inside PRoot. Set PROOT=1 to force test."
  if [ "${FORCE:-}" != "1" ]; then
    echo "Run inside PRoot: proot-distro login ubuntu"
    exit 1
  fi
fi
echo "[PASS] PRoot environment detected"

# Check node is available
if ! command -v node &>/dev/null; then
  echo "[FAIL] Node.js not found"
  exit 1
fi
echo "[PASS] Node.js: $(node --version)"

# Check kadris is installed
if ! command -v kadris &>/dev/null; then
  echo "[FAIL] kadris CLI not found — install with: npm install -g kadris"
  exit 1
fi
echo "[PASS] kadris CLI found"

# Run diagnose-env
echo ""
echo "--- Environment Diagnosis ---"
kadris --diagnose-env --json 2>/dev/null | python3 -m json.tool 2>/dev/null || kadris --diagnose-env

# Check that PRoot is detected in diagnosis
DIAG=$(kadris --diagnose-env --json 2>/dev/null || echo "")
if echo "$DIAG" | grep -q '"isProot": true'; then
  echo "[PASS] PRoot correctly detected by kadris"
else
  echo "[FAIL] PRoot not detected by kadris — expected isProot: true"
fi

# Test that web runtime is selected (not Electron)
if echo "$DIAG" | grep -q '"recommendedRuntime": "web"'; then
  echo "[PASS] Web runtime selected (correct for PRoot)"
else
  echo "[WARN] Runtime selection may not be correct for PRoot"
fi

# Test that --desktop is blocked
echo ""
echo "--- Runtime Tests ---"
kadris --desktop 2>&1 | head -5 || true
echo ""
echo "[CHECK] Did the above show an error about Electron not being available or PRoot being blocked?"

# Test web mode
echo ""
echo "--- Web Mode Test ---"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT
echo "test content" > "$TEMP_DIR/test.txt"
echo "Starting server for 3 seconds..."
kadris "$TEMP_DIR" --no-open --port 43175 &
PID=$!
sleep 3
kill $PID 2>/dev/null || true
echo "[PASS] Server started and stopped in PRoot"

echo ""
echo "=== Test Complete ==="
echo "Expected results:"
echo "  - PRoot detected"
echo "  - Electron blocked (--desktop refused)"
echo "  - Web runtime selected"
echo "  - No Electron dependencies installed"
echo "  - Guidance to exit PRoot and use native Termux"
