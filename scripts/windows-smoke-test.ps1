# Kadris Windows Smoke Test
# Run this script on a real Windows machine with Node.js installed

Write-Host "=== Kadris Windows Smoke Test ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "[PASS] Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Node.js not found" -ForegroundColor Red
    exit 1
}

# 2. Check kadris is installed
try {
    $kadrisVersion = kadris --version
    Write-Host "[PASS] kadris --version: $kadrisVersion" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] kadris not installed. Install with: npm install -g kadris" -ForegroundColor Red
    exit 1
}

# 3. CLI help
$help = kadris --help 2>&1
if ($help -match "Usage") {
    Write-Host "[PASS] kadris --help works" -ForegroundColor Green
} else {
    Write-Host "[FAIL] kadris --help failed" -ForegroundColor Red
}

# 4. Environment diagnosis
$diag = kadris --diagnose-env 2>&1
if ($diag -match "windows") {
    Write-Host "[PASS] Windows detected: $($diag -match 'Platform:')" -ForegroundColor Green
} else {
    Write-Host "[WARN] Platform detection: $diag" -ForegroundColor Yellow
}

# 5. Test with paths containing spaces
$tempDir = Join-Path $env:TEMP "kadris windows test"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
try {
    $result = kadris $tempDir --no-open --port 43176 --diagnose-env 2>&1
    Write-Host "[PASS] Paths with spaces work" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Paths with spaces failed: $_" -ForegroundColor Red
}

# 6. Test on different drive (if available)
$drives = [System.IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq "Fixed" -and $_.Name -ne "C:\" }
if ($drives.Count -gt 0) {
    $altDrive = $drives[0].Name
    $altPath = Join-Path $altDrive "kadris-test"
    try {
        New-Item -ItemType Directory -Path $altPath -Force | Out-Null
        $result = kadris $altPath --no-open --port 43177 --diagnose-env 2>&1
        Write-Host "[PASS] Alternate drive $altDrive works" -ForegroundColor Green
        Remove-Item -Path $altPath -Recurse -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "[WARN] Alternate drive $altDrive test: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[INFO] Only one drive (C:) available, skipping alternate drive test" -ForegroundColor Yellow
}

# 7. Start local server
Write-Host ""
Write-Host "--- Server Test ---" -ForegroundColor Cyan
$serverDir = Join-Path $env:TEMP "kadris-server-test"
New-Item -ItemType Directory -Path $serverDir -Force | Out-Null
"test content" | Out-File -FilePath (Join-Path $serverDir "test.txt") -Encoding utf8

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "kadris"
$psi.Arguments = "$serverDir --no-open --port 43178"
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$process = [System.Diagnostics.Process]::Start($psi)
Start-Sleep -Seconds 3

try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:43178/api/health" -UseBasicParsing -TimeoutSec 5
    if ($health.Content -match "ok") {
        Write-Host "[PASS] Server health check OK" -ForegroundColor Green
    }
} catch {
    Write-Host "[FAIL] Server health check failed: $_" -ForegroundColor Red
}

# Cleanup
$process.Kill() 2>$null
$process.Dispose() 2>$null
Remove-Item -Path $serverDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Manual checks required:" -ForegroundColor Yellow
Write-Host "  - kadris desktop (launches Electron)"
Write-Host "  - kadris . (opens current directory)"
Write-Host "  - PowerShell terminal inside Kadris"
Write-Host "  - npm install -g kadris (fresh install test)"
Write-Host "  - pnpm add -g kadris (pnpm install test)"
Write-Host "  - npm uninstall -g kadris (cleanup test)"
