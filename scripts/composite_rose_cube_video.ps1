<#
.SYNOPSIS
  배경 동영상 + 큐브 포커스 전경 합성. 1분 단위 분할·큐브 크기 조정 지원.

.EXAMPLE
  # 기본: 1분 단위로 분할, 큐브 1.25배(1350px @ 1080 캔버스)
  .\scripts\composite_rose_cube_video.ps1

.EXAMPLE
  # 단일 파일, 큐브 1.5배
  .\scripts\composite_rose_cube_video.ps1 -SegmentSeconds 0 -CubeScale 1.5

.EXAMPLE
  # 30초 단위, 큐브 픽셀 직접 지정
  .\scripts\composite_rose_cube_video.ps1 -SegmentSeconds 30 -CubeSize 1000
#>
param(
    [string]$Background = "",
    [string]$Foreground = "c:\Users\USER\Downloads\mbox-cube_focus (1).mp4",
    [string]$Output = "c:\startingup\Mbox\experiments\outputs\composite_rose_cube_focus.mp4",
    [int]$Size = 1080,
    [double]$CubeScale = 1.25,
    [int]$CubeSize = 0,
    [int]$SegmentSeconds = 60,
    [ValidateSet("ColorKey", "Screen", "Hybrid")]
    [string]$BlendMode = "ColorKey",
    [int]$HybridSwitchSec = 60,
    [string]$ColorKey = "0x000000:0.12:0.18",
    [string]$BgmPath = "",
    [string]$BgmName = "",
    [string]$BackgroundName = "",
    [switch]$ListUserAssets,
    [switch]$ConcatParts,
    [int]$Crf = 18,
    [string]$Preset = "medium"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$UserAssetsRoot = Join-Path $RepoRoot "data\user-assets"

function Resolve-UserBgmByName {
    param([string]$Name)
    $path = Join-Path $UserAssetsRoot "bgm\$Name"
    if (Test-Path -LiteralPath $path) { return $path }
    throw "BGM not found: data/user-assets/bgm/$Name (run npm run sync:user-assets after drop)"
}

function Resolve-BackgroundByName {
    param([string]$Name)
    foreach ($sub in @("background\images", "background\videos")) {
        $path = Join-Path $UserAssetsRoot "$sub\$Name"
        if (Test-Path -LiteralPath $path) { return $path }
    }
    $bgRoot = Join-Path $RepoRoot "data\background"
    $found = Get-ChildItem -LiteralPath $bgRoot -Recurse -File -Filter $Name -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($found) { return $found.FullName }
    throw "Background not found: $Name (drop in data/user-assets/background/ or data/background/)"
}

function Show-UserAssets {
    Write-Host "=== User assets (data/user-assets) ==="
    Write-Host ""
    Write-Host "[BGM] data/user-assets/bgm/"
    $bgmDir = Join-Path $UserAssetsRoot "bgm"
    if (Test-Path $bgmDir) {
        Get-ChildItem -LiteralPath $bgmDir -File |
            Where-Object { $_.Extension -match '\.(mp3|m4a|wav|aac)$' } |
            ForEach-Object { Write-Host ("  - {0}" -f $_.Name) }
    } else {
        Write-Host "  (empty)"
    }
    Write-Host ""
    Write-Host "[Images] data/user-assets/background/images/"
    $imgDir = Join-Path $UserAssetsRoot "background\images"
    if (Test-Path $imgDir) {
        Get-ChildItem -LiteralPath $imgDir -File |
            ForEach-Object { Write-Host ("  - {0}" -f $_.Name) }
    } else {
        Write-Host "  (empty)"
    }
    Write-Host ""
    Write-Host "[Videos] data/user-assets/background/videos/"
    $vidDir = Join-Path $UserAssetsRoot "background\videos"
    if (Test-Path $vidDir) {
        Get-ChildItem -LiteralPath $vidDir -File |
            ForEach-Object { Write-Host ("  - {0}" -f $_.Name) }
    } else {
        Write-Host "  (empty)"
    }
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  -BgmName `"song.mp3`""
    Write-Host "  -BackgroundName `"clip.mp4`""
    Write-Host "After adding files: npm run sync:user-assets"
}

if ($ListUserAssets) {
    Show-UserAssets
    exit 0
}

if ($BgmName) {
    $BgmPath = Resolve-UserBgmByName -Name $BgmName
}
if ($BackgroundName) {
    $Background = Resolve-BackgroundByName -Name $BackgroundName
}

function Resolve-DefaultBgm {
    $builtin = Join-Path $RepoRoot "apps\web\public\bgm\piano-slideshow.mp3"
    if (Test-Path -LiteralPath $builtin) { return $builtin }
    $user = Join-Path $UserAssetsRoot "bgm\piano-slideshow.mp3"
    if (Test-Path -LiteralPath $user) { return $user }
    return ""
}

function Resolve-DefaultBackground {
    $downloads = Join-Path $env:USERPROFILE "Downloads\2026_06_10 11_31.mp4"
    if (Test-Path -LiteralPath $downloads) { return $downloads }

    $bgRoot = Join-Path $PSScriptRoot "..\data\background"
    $found = Get-ChildItem -LiteralPath $bgRoot -Recurse -Filter "2026_06_10 11_31.mp4" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($found) { return $found.FullName }

    throw "Background video not found. Pass -Background explicitly."
}

function Get-ForegroundSize {
    param([int]$Canvas, [double]$Scale, [int]$Explicit)
    if ($Explicit -gt 0) { return $Explicit }
    return [int][Math]::Round($Canvas * $Scale)
}

function Expand-CompositeRenderJobs {
    param(
        [array]$Segments,
        [string]$BlendMode,
        [int]$HybridSwitchSec
    )
    $jobs = @()
    foreach ($seg in $Segments) {
        $start = [double]$seg.Start
        $duration = [double]$seg.Duration
        $end = $start + $duration
        $outPath = [string]$seg.Path
        $index = [int]$seg.Index

        if ($BlendMode -ne "Hybrid") {
            $jobs += [pscustomobject]@{
                Index = $index
                Start = $start
                Duration = $duration
                Path = $outPath
                Mode = $BlendMode
            }
            continue
        }

        if ($start -ge $HybridSwitchSec) {
            $jobs += [pscustomobject]@{
                Index = $index
                Start = $start
                Duration = $duration
                Path = $outPath
                Mode = "Screen"
            }
            continue
        }
        if ($end -le $HybridSwitchSec + 0.001) {
            $jobs += [pscustomobject]@{
                Index = $index
                Start = $start
                Duration = $duration
                Path = $outPath
                Mode = "ColorKey"
            }
            continue
        }

        $firstLen = $HybridSwitchSec - $start
        $secondLen = $end - $HybridSwitchSec
        $base = [System.IO.Path]::GetFileNameWithoutExtension($outPath)
        $ext = [System.IO.Path]::GetExtension($outPath)
        $dir = [System.IO.Path]::GetDirectoryName($outPath)
        $partA = Join-Path $dir ("{0}_hybrid_a{1}" -f $base, $ext)
        $partB = Join-Path $dir ("{0}_hybrid_b{1}" -f $base, $ext)
        $jobs += [pscustomobject]@{
            Index = $index
            Start = $start
            Duration = $firstLen
            Path = $partA
            Mode = "ColorKey"
            MergeInto = $outPath
            MergePart = "a"
        }
        $jobs += [pscustomobject]@{
            Index = $index
            Start = $HybridSwitchSec
            Duration = $secondLen
            Path = $partB
            Mode = "Screen"
            MergeInto = $outPath
            MergePart = "b"
        }
    }
    return $jobs
}

function Merge-HybridParts {
    param(
        [string]$PartA,
        [string]$PartB,
        [string]$OutPath
    )
    $listPath = "$OutPath.concat.txt"
    @(
        "file '$($PartA -replace '\\','/')'",
        "file '$($PartB -replace '\\','/')'"
    ) | Set-Content -Path $listPath -Encoding ASCII
    ffmpeg -y -f concat -safe 0 -i $listPath -c copy $OutPath
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg hybrid concat failed: $OutPath" }
    Remove-Item -LiteralPath $listPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $PartA -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $PartB -Force -ErrorAction SilentlyContinue
}

function New-CompositeFilter {
    param(
        [int]$Canvas,
        [int]$Foreground,
        [string]$Key,
        [string]$Mode,
        [double]$BgStart = 0,
        [double]$FgStart = 0,
        [double]$Length = 0
    )
    $bgChain = if ($BgStart -gt 0.001) {
        "[0:v]trim=start=${BgStart}:duration=${Length},setpts=PTS-STARTPTS,"
    } else {
        "[0:v]"
    }
    $fgChain = if ($FgStart -gt 0.001) {
        "[1:v]trim=start=${FgStart}:duration=${Length},setpts=PTS-STARTPTS,"
    } else {
        "[1:v]"
    }
    if ($Mode -eq "Screen") {
        return @"
${bgChain}scale=${Canvas}:${Canvas}:force_original_aspect_ratio=increase,crop=${Canvas}:${Canvas},fps=30,format=yuv420p[bg];
${fgChain}scale=${Canvas}:${Canvas}:force_original_aspect_ratio=decrease,format=yuv420p,fps=30,pad=${Canvas}:${Canvas}:(ow-iw)/2:(oh-ih)/2:color=black[fgpad];
[bg][fgpad]blend=all_mode=screen:all_opacity=1,format=yuv420p[outv]
"@ -replace "`r?`n", ""
    }
    return @"
${bgChain}scale=${Canvas}:${Canvas}:force_original_aspect_ratio=increase,crop=${Canvas}:${Canvas},fps=30,format=yuv420p[bg];
${fgChain}scale=${Foreground}:${Foreground}:force_original_aspect_ratio=decrease,format=yuv420p,fps=30[fg0];
[fg0]colorkey=${Key}[fgk];
[bg][fgk]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p[outv]
"@ -replace "`r?`n", ""
}

function Invoke-CompositeSegment {
    param(
        [string]$Bg,
        [string]$Fg,
        [string]$OutPath,
        [int]$Canvas,
        [int]$Foreground,
        [string]$Key,
        [string]$Mode,
        [double]$Start,
        [double]$Length,
        [double]$BgDuration,
        [string]$Bgm,
        [int]$Crf,
        [string]$Preset
    )

    $bgStart = if ($BgDuration -gt 0) {
        $Start - [Math]::Floor($Start / $BgDuration) * $BgDuration
    } else { 0 }
    $lenArg = "{0:F3}" -f $Length
    $filter = New-CompositeFilter -Canvas $Canvas -Foreground $Foreground -Key $Key -Mode $Mode `
        -BgStart $bgStart -FgStart $Start -Length $Length

    $ffArgs = @("-y", "-stream_loop", "-1", "-i", $Bg, "-i", $Fg)
    if ($Bgm -and (Test-Path -LiteralPath $Bgm)) {
        $ffArgs += @("-stream_loop", "-1", "-i", $Bgm)
    }
    $ffArgs += @("-filter_complex", $filter, "-map", "[outv]")
    if ($Bgm -and (Test-Path -LiteralPath $Bgm)) {
        $ffArgs += @("-map", "2:a", "-shortest")
    } else {
        $ffArgs += @("-map", "0:a?")
    }
    $ffArgs += @(
        "-t", $lenArg,
        "-c:v", "libx264", "-preset", $Preset, "-crf", "$Crf", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        $OutPath
    )
    & ffmpeg @ffArgs

    if ($LASTEXITCODE -ne 0) {
        throw "ffmpeg failed for segment: $OutPath"
    }
}

if (-not $Background) {
    $Background = Resolve-DefaultBackground
}
if (-not $BgmPath) {
    $BgmPath = Resolve-DefaultBgm
    if ($BgmPath) {
        Write-Host "Default BGM: $BgmPath"
    }
}

$foregroundSize = Get-ForegroundSize -Canvas $Size -Scale $CubeScale -Explicit $CubeSize
$outputDir = Split-Path -Parent $Output
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

$totalDuration = [double](ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $Foreground).Trim()
$bgDuration = [double](ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $Background).Trim()
$baseName = [System.IO.Path]::GetFileNameWithoutExtension($Output)
$ext = [System.IO.Path]::GetExtension($Output)
if (-not $ext) { $ext = ".mp4" }

$segments = @()
if ($SegmentSeconds -le 0) {
    $segments += [pscustomobject]@{
        Index = 1
        Start = 0.0
        Duration = $totalDuration
        Path = $Output
    }
} else {
    $index = 1
    $start = 0.0
    while ($start -lt $totalDuration - 0.05) {
        $duration = [Math]::Min($SegmentSeconds, $totalDuration - $start)
        $partName = "{0}_part{1:D2}{2}" -f $baseName, $index, $ext
        $segments += [pscustomobject]@{
            Index = $index
            Start = $start
            Duration = $duration
            Path = Join-Path $outputDir $partName
        }
        $start += $SegmentSeconds
        $index++
    }
}

Write-Host ("Canvas={0}px Cube={1}px (scale={2}) Segments={3} Total={4:F1}s" -f `
    $Size, $foregroundSize, $CubeScale, $segments.Count, $totalDuration)

$manifest = @{
    background = $Background
    foreground = $Foreground
    canvasSize = $Size
    cubeSize = $foregroundSize
    cubeScale = $CubeScale
    blendMode = $BlendMode
    hybridSwitchSec = if ($BlendMode -eq "Hybrid") { $HybridSwitchSec } else { $null }
    segmentSeconds = $SegmentSeconds
    totalDuration = $totalDuration
    bgmPath = $BgmPath
    segments = @()
}

$renderJobs = Expand-CompositeRenderJobs -Segments $segments -BlendMode $BlendMode -HybridSwitchSec $HybridSwitchSec
$mergeGroups = @{}

foreach ($job in $renderJobs) {
    $label = if ($SegmentSeconds -le 0) { "full" } else { "part $($job.Index)/$($segments.Count)" }
    Write-Host ("[{0}] {1:F1}s + {2:F1}s mode={3} -> {4}" -f $label, $job.Start, $job.Duration, $job.Mode, $job.Path)
    Invoke-CompositeSegment `
        -Bg $Background -Fg $Foreground -OutPath $job.Path `
        -Canvas $Size -Foreground $foregroundSize -Key $ColorKey -Mode $job.Mode `
        -Start $job.Start -Length $job.Duration -BgDuration $bgDuration -Bgm $BgmPath `
        -Crf $Crf -Preset $Preset

    if ($job.MergeInto) {
        $key = $job.MergeInto
        if (-not $mergeGroups.ContainsKey($key)) {
            $mergeGroups[$key] = @{}
        }
        $mergeGroups[$key][$job.MergePart] = $job.Path
    }
}

foreach ($entry in $mergeGroups.GetEnumerator()) {
    $out = $entry.Key
    $parts = $entry.Value
    if ($parts.a -and $parts.b) {
        Write-Host "Hybrid merge -> $out"
        Merge-HybridParts -PartA $parts.a -PartB $parts.b -OutPath $out
    }
}

foreach ($seg in $segments) {
    $mode = if ($BlendMode -eq "Hybrid") {
        if ($seg.Start -ge $HybridSwitchSec) { "Screen" }
        elseif (($seg.Start + $seg.Duration) -le $HybridSwitchSec) { "ColorKey" }
        else { "Hybrid" }
    } else { $BlendMode }

    $manifest.segments += @{
        index = $seg.Index
        startSec = [Math]::Round($seg.Start, 3)
        durationSec = [Math]::Round($seg.Duration, 3)
        blendMode = $mode
        file = $seg.Path
    }
}

$manifestPath = Join-Path $outputDir ("{0}_manifest.json" -f $baseName)
$manifestJson = $manifest | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, [System.UTF8Encoding]::new($false))
Write-Host "Wrote manifest: $manifestPath"

if ($ConcatParts -and $SegmentSeconds -gt 0 -and $segments.Count -gt 1) {
    $listPath = Join-Path $outputDir ("{0}_concat_list.txt" -f $baseName)
    $lines = $segments | ForEach-Object { "file '$($_.Path -replace '\\','/')'" }
    $lines | Set-Content -Path $listPath -Encoding ASCII
    $concatOut = Join-Path $outputDir ("{0}_concat.mp4" -f $baseName)
    ffmpeg -y -f concat -safe 0 -i $listPath -c copy $concatOut
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg concat failed" }
    Write-Host "Wrote concat: $concatOut"
}
