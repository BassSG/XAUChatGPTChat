param(
  [Parameter(Mandatory = $true)][string]$ReportPath,
  [Parameter(Mandatory = $false)][string]$ImagePath
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$reportDirectory = Join-Path $repoRoot 'public\reports'
$archiveDirectory = Join-Path $reportDirectory 'archive'
$targetReport = Join-Path $reportDirectory 'latest.json'
$targetImage = Join-Path $reportDirectory 'latest.png'

if (-not (Test-Path -LiteralPath $ReportPath -PathType Leaf)) {
  throw "Report file not found: $ReportPath"
}
$report = Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json
if (-not $report.snapshotAt -or -not $report.status -or -not $report.summary) {
  throw 'Report JSON must include snapshotAt, status, and summary.'
}
if ($ImagePath -and -not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) {
  throw "Image file not found: $ImagePath"
}

$timestamp = [DateTimeOffset]::Parse([string]$report.snapshotAt).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
if ($ImagePath) {
  New-Item -ItemType Directory -Force -Path $archiveDirectory | Out-Null
  $archiveName = 'analysis-' + $timestamp + '.png'
  Copy-Item -LiteralPath $ImagePath -Destination $targetImage -Force
  Copy-Item -LiteralPath $ImagePath -Destination (Join-Path $archiveDirectory $archiveName) -Force
  $report.imageUrl = 'https://basssg.github.io/XAUChatGPTChat/reports/archive/' + $archiveName
} else {
  $report.imageUrl = $null
}

$report | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $targetReport -Encoding utf8
Set-Location -LiteralPath $repoRoot
git add -- public/reports/latest.json
if ($ImagePath) {
  git add -- public/reports/latest.png
  git add -- ('public/reports/archive/analysis-' + $timestamp + '.png')
}
git diff --cached --quiet
$diffStatus = $LASTEXITCODE
if ($diffStatus -eq 0) {
  Write-Output 'No changes to publish.'
  exit 0
}
if ($diffStatus -ne 1) { throw 'Could not inspect staged report changes.' }
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
git commit -m "Publish XAU desk brief $stamp"
if ($LASTEXITCODE -ne 0) { throw 'Could not commit the report.' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Could not push the report to GitHub.' }
Write-Output 'Report committed; GitHub Actions will publish it to the app and notification service.'
