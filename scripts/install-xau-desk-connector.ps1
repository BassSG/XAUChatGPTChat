param([switch]$InstallStartup)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$agentPath = Join-Path $PSScriptRoot 'xau-desk-agent.mjs'
$stateDirectory = Join-Path $env:LOCALAPPDATA 'XAU Desk'
if (-not (Test-Path -LiteralPath (Join-Path $stateDirectory 'bootstrap.key'))) {
  throw 'Provision the connector first. No startup entry was installed.'
}
$nodePath = (Get-Command node -ErrorAction Stop).Source
$stdoutPath = Join-Path $stateDirectory 'connector.log'
$stderrPath = Join-Path $stateDirectory 'connector-error.log'
function Quote-Literal([string]$Value) { "'" + $Value.Replace("'", "''") + "'" }
$startCommand = 'Start-Process -WindowStyle Hidden -FilePath ' + (Quote-Literal $nodePath) + ' -ArgumentList ' + (Quote-Literal ('"' + $agentPath + '"')) + ' -WorkingDirectory ' + (Quote-Literal $repoRoot) + ' -RedirectStandardOutput ' + (Quote-Literal $stdoutPath) + ' -RedirectStandardError ' + (Quote-Literal $stderrPath)
if ($InstallStartup) {
  $startupDirectory = [Environment]::GetFolderPath('Startup')
  $shortcutPath = Join-Path $startupDirectory 'XAU Desk Connector.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = (Get-Command powershell.exe).Source
  $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($startCommand))
  $shortcut.Arguments = '-NoProfile -WindowStyle Hidden -EncodedCommand ' + $encodedCommand
  $shortcut.WorkingDirectory = $repoRoot
  $shortcut.WindowStyle = 7
  $shortcut.Description = 'Connect XAU Desk requests only while Codex desktop is open.'
  $shortcut.Save()
  Write-Output 'Current-user startup connector installed.'
}
Start-Process -WindowStyle Hidden -FilePath $nodePath -ArgumentList ('"' + $agentPath + '"') -WorkingDirectory $repoRoot -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
Write-Output 'Connector launched. Pairing instructions are stored locally.'
