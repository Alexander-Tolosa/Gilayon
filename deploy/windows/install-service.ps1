<#
  Installs Himsog as a background task that starts with Windows and restarts if it stops.
  Run in an ADMINISTRATOR PowerShell on the clinic server PC, from anywhere:

    .\deploy\windows\install-service.ps1
    .\deploy\windows\install-service.ps1 -AppPath D:\himsog -Name "Himsog Server"

  Before this: npm install, npm run build, npm run https:setup, and a filled-in .env file.
  NOTE: written for Windows 10/11 and Windows Server; not exercised on a real Windows machine yet.
  Try it on the clinic PC and run  Get-ScheduledTaskInfo -TaskName "Himsog Server"  to check.
#>
param(
  [string]$AppPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$Name = 'Himsog Server'
)

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this in an administrator PowerShell.'
}

$node = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path (Join-Path $AppPath 'server.mjs'))) { throw "server.mjs not found in $AppPath" }
if (-not (Test-Path (Join-Path $AppPath '.next'))) { throw "No build found in $AppPath. Run: npm run build" }
if (-not (Test-Path (Join-Path $AppPath 'certs\server.crt'))) { throw "No certificate in $AppPath\certs. Run: npm run https:setup" }
if (-not (Test-Path (Join-Path $AppPath '.env'))) { Write-Warning ".env not found in $AppPath. The server will use defaults (no backups!)." }

# Read the ports from .env so the firewall rules match.
$httpsPort = 3443; $httpPort = 3000
$envFile = Join-Path $AppPath '.env'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*HTTPS_PORT\s*=\s*(\d+)') { $httpsPort = [int]$Matches[1] }
    if ($line -match '^\s*HTTP_PORT\s*=\s*(\d+)') { $httpPort = [int]$Matches[1] }
  }
}

# Replace an earlier install.
if (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute $node -Argument 'server.mjs' -WorkingDirectory $AppPath
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description 'Himsog HMO-Clinic records server (HTTPS)' | Out-Null

# Let the other clinic PCs in (private network only).
foreach ($rule in @(@{ N = "$Name HTTPS"; P = $httpsPort }, @{ N = "$Name HTTP redirect"; P = $httpPort })) {
  Get-NetFirewallRule -DisplayName $rule.N -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName $rule.N -Direction Inbound -Protocol TCP -LocalPort $rule.P -Action Allow -Profile Private,Domain | Out-Null
}

Start-ScheduledTask -TaskName $Name
Write-Host "Installed '$Name'. It starts with Windows and restarts if it stops."
Write-Host "Open https://localhost:$httpsPort on this PC to check."
