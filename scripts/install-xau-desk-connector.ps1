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
function Quote-Argument([string]$Value) { '"' + $Value.Replace('"', '\"') + '"' }
$launcherPath = Join-Path $PSScriptRoot 'xau-desk-background.vbs'
$arguments = @('//B', '//Nologo', (Quote-Argument $launcherPath), (Quote-Argument $nodePath), (Quote-Argument $agentPath), (Quote-Argument $stateDirectory), (Quote-Argument $codexHome)) -join ' '
$action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\wscript.exe') -Argument $arguments -WorkingDirectory $repoRoot
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$taskArgs = @{TaskName='XAU Desk Connector';Action=$action;Principal=$principal;Settings=$settings;Description='Receive XAU Desk analysis requests in the signed-in user session';Force=$true}
if ($InstallStartup) { $taskArgs.Trigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name) }
Register-ScheduledTask @taskArgs | Out-Null
if ($InstallStartup) {
  $shell = New-Object -ComObject WScript.Shell
  $startMenuPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'XAU Desk Connector.lnk'
  $startMenuShortcut = $shell.CreateShortcut($startMenuPath)
  $startMenuShortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $startMenuShortcut.Arguments = '//B //Nologo ' + (Quote-Argument (Join-Path $PSScriptRoot 'xau-desk-start.vbs'))
  $startMenuShortcut.WorkingDirectory = $repoRoot
  $startMenuShortcut.WindowStyle = 7
  $startMenuShortcut.Save()
  # Remove the duplicate Startup shortcut created by older installations.
  $shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'XAU Desk Connector.lnk'
  if (Test-Path -LiteralPath $shortcutPath) {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    if ($shortcut.TargetPath -eq (Get-Command powershell.exe).Source -and $shortcut.Arguments -like '*Start-ScheduledTask*XAU Desk Connector*') {
      Remove-Item -LiteralPath $shortcutPath
    }
  }
}
Start-ScheduledTask -TaskName 'XAU Desk Connector'
Write-Output 'Connector registered and started independently of the chat process.'
