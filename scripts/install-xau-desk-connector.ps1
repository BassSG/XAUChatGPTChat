param([switch]$InstallStartup)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$agentPath = Join-Path $PSScriptRoot 'xau-desk-agent.mjs'
$stateDirectory = Join-Path $env:LOCALAPPDATA 'XAU Desk'
$bootstrapPath = Join-Path $stateDirectory 'bootstrap.key'
if (-not (Test-Path -LiteralPath $bootstrapPath)) { throw 'Provision the connector first.' }
$nodePath = (Get-Command node -ErrorAction Stop).Source
# Resolve the actual file location: packaged Codex redirects AppData files.
$stateDirectory = & $nodePath -e "console.log(require('path').dirname(require('fs').realpathSync.native(process.argv[1])))" $bootstrapPath
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve connector state directory.' }
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
function Quote-Literal([string]$Value) { "'" + $Value.Replace("'", "''") + "'" }
$launch = '$env:XAU_DESK_PERSIST=''1''; $env:XAU_DESK_STATE_DIR=' + (Quote-Literal $stateDirectory) + '; $env:CODEX_HOME=' + (Quote-Literal $codexHome) + '; & ' + (Quote-Literal $nodePath) + ' ' + (Quote-Literal $agentPath) + ' 1>> ' + (Quote-Literal (Join-Path $stateDirectory 'scheduled.log')) + ' 2>> ' + (Quote-Literal (Join-Path $stateDirectory 'scheduled-error.log'))
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($launch))
$action = New-ScheduledTaskAction -Execute (Get-Command powershell.exe).Source -Argument ('-NoProfile -WindowStyle Hidden -EncodedCommand ' + $encoded) -WorkingDirectory $repoRoot
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$taskArgs = @{TaskName='XAU Desk Connector';Action=$action;Principal=$principal;Settings=$settings;Description='Receive XAU Desk analysis requests in the signed-in user session';Force=$true}
if ($InstallStartup) { $taskArgs.Trigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name) }
Register-ScheduledTask @taskArgs | Out-Null
if ($InstallStartup) {
  # Keep the existing shortcut compatible; both routes target the same singleton task.
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'XAU Desk Connector.lnk'))
  $shortcut.TargetPath = (Get-Command powershell.exe).Source
  $shortcut.Arguments = '-NoProfile -WindowStyle Hidden -Command "Start-ScheduledTask -TaskName ''XAU Desk Connector''"'
  $shortcut.WindowStyle = 7
  $shortcut.Save()
}
Start-ScheduledTask -TaskName 'XAU Desk Connector'
Write-Output 'Connector registered and started independently of the chat process.'
