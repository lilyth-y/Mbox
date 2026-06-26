$ErrorActionPreference = "Stop"

# Creates a local crystal_showcase render job then runs the worker once.
# Uses local GPU (ANGLE) by default. Set $env:MBOX_GL=swiftshader to force software GL.

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $env:MBOX_WEB_BASE_URL) { $env:MBOX_WEB_BASE_URL = "http://127.0.0.1:4176" }
if (-not $env:VITE_API_BASE_URL) { $env:VITE_API_BASE_URL = "http://127.0.0.1:8787" }
if (-not $env:MBOX_GL) { $env:MBOX_GL = "angle" }
if (-not $env:VITE_RENDER_BACKEND) { $env:VITE_RENDER_BACKEND = "local" }

Write-Host "WEB  : $env:MBOX_WEB_BASE_URL"
Write-Host "API  : $env:VITE_API_BASE_URL"
Write-Host "GL   : $env:MBOX_GL"
Write-Host ""

node scripts/verify-render-job-crystal.mjs

