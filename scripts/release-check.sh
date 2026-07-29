#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

FAIL=0
PASS=0
REPORT="/tmp/kadris-release-check-$$.txt"

pass() { PASS=$((PASS+1)); echo "[PASS] $1"; echo "[PASS] $1" >> "$REPORT"; }
fail() { FAIL=$((FAIL+1)); echo "[FAIL] $1"; echo "[FAIL] $1" >> "$REPORT"; }
check() {
  local desc="$1" cmd="$2"
  if eval "$cmd" 2>/dev/null; then pass "$desc"; else fail "$desc (see above)"; fi
}

echo "=== Kadris Release Check ===" > "$REPORT"
echo "" >> "$REPORT"

# 1. Environment validation
echo "--- 1. Environment ---"
check "Node.js >= 22.12.0" "node -e 'process.exit(Number(process.version.slice(1) < \"22.12.0\"))'"

# 2. Version consistency
echo "--- 2. Version ---"
check "package.json has valid version" "node -e 'const v=require(\"./package.json\").version; process.exit(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(v)?0:1)'"
PKG_VERSION=$(node -p "require('./package.json').version")
pass "Version: $PKG_VERSION"

# 3. Required files exist
echo "--- 3. Required files ---"
for f in package.json README.md LICENSE CHANGELOG.md install.sh tsconfig.json eslint.config.js vite.web.config.ts vite.node.config.ts; do
  [ -f "$f" ] && pass "File exists: $f" || fail "Missing file: $f"
done

# 4. Secret audit (basic)
echo "--- 4. Secret audit ---"
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' -l 'api[_-]key\|API_KEY\|api_key\|sk-[A-Za-z0-9]\|ghp_\|gho_\|ghu_\' src/ tests/ 2>/dev/null | grep -v '.test.ts' | grep -v 'contracts' | grep -v 'ai-provider-contracts' | head -3; then
  fail "Possible secrets found in source"
else
  pass "No obvious secrets in source"
fi

# 5. Type-check
echo "--- 5. Type-check ---"
check "TypeScript type-check" "npm run typecheck"

# 6. Lint
echo "--- 6. Lint ---"
check "ESLint" "npm run lint"

# 7. Tests
echo "--- 7. Tests ---"
check "Tests pass" "npm test"

# 8. Builds
echo "--- 8. Builds ---"
check "Web build" "npm run build:web"
check "Portable build (CLI+server)" "npm run build:portable"

# 9. CLI works
echo "--- 9. CLI ---"
check "kadris --version" "node dist/cli/index.js --version"
check "kadris --help" "node dist/cli/index.js --help"
check "kadris --diagnose-env" "node dist/cli/index.js --diagnose-env"

# 10. npm pack dry-run
echo "--- 10. npm pack ---"
check "npm pack --dry-run" "npm pack --dry-run --json > /dev/null 2>&1"

# 11. Verify no Electron in npm package
echo "--- 11. Electron check ---"
check "Electron not in dependencies" "node -e 'const p=require(\"./package.json\"); process.exit(p.dependencies&&p.dependencies.electron?1:0)'"

# 12. Summary
echo ""
echo "=== Summary ===" >> "$REPORT"
echo "Passed: $PASS" >> "$REPORT"
echo "Failed: $FAIL" >> "$REPORT"
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Report: $REPORT"
[ "$FAIL" -eq 0 ] || exit 1
