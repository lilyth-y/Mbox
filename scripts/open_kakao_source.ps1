# Opens the KakaoTalk download image folder (canonical input for mbox).
$Root = Split-Path $PSScriptRoot -Parent
$Dir = Join-Path $Root "data\asset\temp_1778692001076.-1818431043"
if (-not (Test-Path $Dir)) {
    Write-Host "Folder not found: $Dir"
    exit 1
}
$count = (Get-ChildItem $Dir -Filter "KakaoTalk_*.jpg").Count
Write-Host "KakaoTalk inputs: $count JPG(s) in"
Write-Host "  $Dir"
Write-Host ""
Write-Host "Quick cube preview (API + web running):"
Write-Host "  npm run dev"
Write-Host "  python scripts/preview_kakao_cube_quick.py"
Write-Host ""
Write-Host "Full 20-image batch:"
Write-Host "  python scripts/run_data_asset_batch_only.py"
Start-Process explorer.exe $Dir
