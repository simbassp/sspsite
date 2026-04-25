param(
  [string]$Branch = "main",
  [string]$Server = "root@pvossp.ru",
  [string]$RemoteDir = "/var/www/ssp"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

Write-Host "==> Pushing local branch '$Branch' to origin..." -ForegroundColor Cyan
git push origin $Branch
if ($LASTEXITCODE -ne 0) {
  throw "git push failed."
}

$remoteCommand = "set -e; cd $RemoteDir; git pull origin $Branch; npm ci; npm run build; pm2 restart all"

Write-Host "==> Deploying on $Server..." -ForegroundColor Cyan
ssh $Server $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "Remote deploy failed."
}

Write-Host "==> Deploy completed." -ForegroundColor Green
