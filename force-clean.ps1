#!/usr/bin/env pwsh
# Force clean and rebuild - clears all caches

Write-Host "`n=== Force Clean & Rebuild ===" -ForegroundColor Cyan

# 1. Clean dist folder
Write-Host "`nStep 1: Cleaning dist folder..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
    Write-Host "  Removed dist/" -ForegroundColor Gray
}

# 2. Clean node_modules/.cache
Write-Host "`nStep 2: Cleaning build caches..." -ForegroundColor Yellow
if (Test-Path "node_modules/.cache") {
    Remove-Item -Recurse -Force "node_modules/.cache"
    Write-Host "  Removed node_modules/.cache" -ForegroundColor Gray
}

# 3. Rebuild
Write-Host "`nStep 3: Rebuilding..." -ForegroundColor Yellow
npm run compile

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n SUCCESS - Extension rebuilt from scratch" -ForegroundColor Green
    Write-Host ""
    Write-Host "Now do ONE of these:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "If running extension via F5:" -ForegroundColor White
    Write-Host "  1. Close Extension Development Host window" -ForegroundColor Gray
    Write-Host "  2. In main VS Code: Ctrl+Shift+P" -ForegroundColor Gray
    Write-Host "  3. Type: 'Developer: Reload Window'" -ForegroundColor Gray
    Write-Host "  4. Press F5 to launch fresh extension" -ForegroundColor Gray
    Write-Host ""
    Write-Host "If extension is installed:" -ForegroundColor White
    Write-Host "  1. Uninstall the extension completely" -ForegroundColor Gray
    Write-Host "  2. Close ALL VS Code windows" -ForegroundColor Gray
    Write-Host "  3. Run: npm run package" -ForegroundColor Gray
    Write-Host "  4. Install the new .vsix file" -ForegroundColor Gray
    Write-Host "  5. Restart VS Code" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "`n Build FAILED!" -ForegroundColor Red
    exit 1
}
