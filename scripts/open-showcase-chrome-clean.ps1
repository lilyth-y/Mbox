# Opens showcase in an isolated Chrome profile with discrete GPU / ANGLE flags.
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) {
  Write-Error "Chrome not found at $chrome"
  exit 1
}

$profile = Join-Path $env:TEMP "mbox-webgl-test"
$url = "http://localhost:5173/showcase.html?localOnly=1&fullGpu=1&look=rose_gold_premium&bg=solid_black&noPhysics=1"

# Windows hybrid GPU — prefer NVIDIA/AMD dGPU for WebGL (same as export script).
try {
  $key = "HKCU:\SOFTWARE\Microsoft\DirectX\UserGpuPreferences"
  if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
  Set-ItemProperty -Path $key -Name $chrome -Value "GpuPreference=2;" -Type String -Force
  Write-Host "GPU preference: High performance -> $chrome"
} catch {
  Write-Warning "Could not set discrete GPU preference: $_"
}

Write-Host "Profile: $profile"
Write-Host "URL: $url"
Write-Host ""
Write-Host "If WebGL still fails: Chrome 설정 -> 시스템 -> 하드웨어 가속 사용 ON, chrome://gpu 에서 WebGL2 확인"
Write-Host ""

Start-Process -FilePath $chrome -ArgumentList @(
  "--user-data-dir=$profile",
  "--no-first-run",
  "--no-default-browser-check",
  "--force-high-performance-gpu",
  "--use-angle=d3d11",
  "--use-gl=angle",
  "--ignore-gpu-blocklist",
  $url
)
