#!/usr/bin/env pwsh
# Quick script to rebuild and remind user to reload

Write-Host "`n=== Copilot Spec Sync - Rebuild & Reload ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "Building extension..." -ForegroundColor Yellow
npm run compile

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nBuild successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "IMPORTANT: You MUST reload VS Code now!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "How to reload:" -ForegroundColor White
    Write-Host "  1. Press Ctrl+Shift+P" -ForegroundColor Gray
    Write-Host "  2. Type 'Reload Window'" -ForegroundColor Gray
    Write-Host "  3. Press Enter" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or if testing extension (F5 mode):" -ForegroundColor White
    Write-Host "  - Close Extension Development Host window" -ForegroundColor Gray
    Write-Host "  - Press F5 to launch fresh instance" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "`nBuild failed!" -ForegroundColor Red
    exit 1
}
