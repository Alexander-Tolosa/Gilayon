<#
  Makes THIS PC trust the clinic's certificate authority, so the Gilayon address opens with a
  padlock and no warning. Run once per clinic PC, in an ADMINISTRATOR PowerShell:

    .\trust-ca.ps1 -Server 192.168.1.10          downloads http://192.168.1.10:3000/ca.crt
    .\trust-ca.ps1 -File E:\himsog-ca.crt        or use the file from a USB stick

  It shows the certificate's fingerprint and asks you to compare it with the one on the server
  (Settings > Secure connection, or: npm run https:status) before installing.
#>
param(
  [string]$Server,
  [int]$HttpPort = 3000,
  [string]$File
)

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this in an administrator PowerShell.'
}

if (-not $File) {
  if (-not $Server) { throw 'Give -Server <address of the clinic server> or -File <path to himsog-ca.crt>.' }
  $File = Join-Path $env:TEMP 'himsog-ca.crt'
  Invoke-WebRequest -Uri "http://${Server}:$HttpPort/ca.crt" -OutFile $File -UseBasicParsing
}

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $File
$sha256 = [BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash($cert.RawData)).Replace('-', ':')
Write-Host ''
Write-Host "Subject:     $($cert.Subject)"
Write-Host "SHA-256:     $sha256"
Write-Host "Valid until: $($cert.NotAfter)"
Write-Host ''
$answer = Read-Host 'Does this fingerprint match the one on the clinic server? (yes/no)'
if ($answer -ne 'yes') { throw 'Not installed.' }

certutil -addstore -f Root $File | Out-Null
Write-Host 'Installed. Close and reopen Edge or Chrome. Firefox needs the file imported by hand (see the README).'
