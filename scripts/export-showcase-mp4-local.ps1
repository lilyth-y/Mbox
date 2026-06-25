# Local GPU showcase MP4 export (Playwright + Chrome ANGLE).
# Usage:
#   .\scripts\export-showcase-mp4-local.ps1
#   .\scripts\export-showcase-mp4-local.ps1 -Photos "C:\photos\a.jpg","C:\photos\b.jpg"

param(
  [string]$Url = "http://localhost:5173/showcase.html?localOnly=1&look=rose_gold_premium&bg=solid_black&noPhysics=1&fullGpu=1",
  [string[]]$Photos = @(),
  [ValidateSet("angle", "swiftshader")]
  [string]$Gl = "angle"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue)) {
  Write-Host "Starting dev server on :5173 ..."
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev --workspace @mbox/web" -WindowStyle Minimized
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    if (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue) { break }
    Start-Sleep -Seconds 1
  }
}

$env:MBOX_GL = $Gl
$env:MBOX_WEB_URL = $Url

$chrome = @(
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if ($chrome) {
  $gpuKey = "HKCU:\SOFTWARE\Microsoft\DirectX\UserGpuPreferences"
  if (-not (Test-Path $gpuKey)) { New-Item -Path $gpuKey -Force | Out-Null }
  New-ItemProperty -Path $gpuKey -Name $chrome -Value "GpuPreference=2;" -PropertyType String -Force | Out-Null
  Write-Host "Windows GPU: High performance -> $chrome"
}

$args = @("scripts/export-showcase-mp4-local.mjs", $Url)
if ($Photos.Count -gt 0) {
  $args += @("--photos") + $Photos
}

node @args
