# Build web for internal pilot. Requires apps/web/.env.production.local
# (copy from .env.internal.example at repo root).

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $Root

$EnvFile = Join-Path $Root "apps\web\.env.production.local"
if (-not (Test-Path $EnvFile)) {
    Write-Host "Missing $EnvFile"
    Write-Host "Copy .env.internal.example -> apps\web\.env.production.local and edit URLs/secrets."
    exit 1
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $name, $value = $_ -split '=', 2
    Set-Item -Path "env:$name" -Value $value.Trim('"')
}

Write-Host "Building shared + web (internal)..."
npm run build --workspace @mbox/shared
npm run build --workspace @mbox/web
Write-Host "Output: apps\web\dist"
Write-Host "Next: deploy dist to corp static host; API via deploy\internal\api.env.example"
