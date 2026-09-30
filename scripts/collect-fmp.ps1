param([Parameter(Mandatory=$true)][string]$OutputPath, [switch]$ForceRefresh, [string]$Since, [string]$Until)
$ErrorActionPreference='Stop'
$previous=$env:FMP_API_KEY
try {
  $credential=Join-Path $env:LOCALAPPDATA 'XAUDesk\secrets\fmp-key.dpapi'
  $secure=(Get-Content -LiteralPath $credential -Raw).Trim() | ConvertTo-SecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $env:FMP_API_KEY=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  $arguments=@((Join-Path $PSScriptRoot 'collect-fmp.mjs'),'--output',$OutputPath)
  if ($ForceRefresh) { $arguments+='--force-refresh' }
  if ($Since) { $arguments+=@('--since',$Since) }
  if ($Until) { $arguments+=@('--until',$Until) }
  node @arguments
  if ($LASTEXITCODE -ne 0) { throw 'FMP collection failed; continue with original sources.' }
} catch { Write-Error 'FMP unavailable. Continue the report with original sources; no credentials are displayed.' }
finally { $env:FMP_API_KEY=$previous }
