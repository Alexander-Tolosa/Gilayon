<# Removes the Gilayon background task and its firewall rules. Run in an administrator PowerShell. #>
param([string]$Name = 'Gilayon Server')
$ErrorActionPreference = 'Stop'
if (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false
}
foreach ($n in @("$Name HTTPS", "$Name HTTP redirect")) {
  Get-NetFirewallRule -DisplayName $n -ErrorAction SilentlyContinue | Remove-NetFirewallRule
}
Write-Host "Removed '$Name'. Records and backups were not touched."
