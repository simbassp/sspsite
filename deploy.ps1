param(
  [string]$Branch = "main",
  [string]$Server = "root@pvossp.ru",
  [string]$RemoteDir = "/var/www/ssp",
  [switch]$LocalSync
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

Write-Host "==> Pushing local branch '$Branch' to origin..." -ForegroundColor Cyan
git push origin $Branch
if ($LASTEXITCODE -ne 0) {
  throw "git push failed."
}

function Sync-ArchiveToRemote {
  Write-Host "==> Uploading branch '$Branch' to $Server (git pull on server skipped)..." -ForegroundColor Yellow
  $archivePath = Join-Path ([System.IO.Path]::GetTempPath()) "ssp-deploy-$Branch.tar"
  try {
    if (Test-Path $archivePath) {
      Remove-Item -Force $archivePath
    }
    git archive --format=tar -o $archivePath $Branch
    if ($LASTEXITCODE -ne 0) {
      throw "git archive failed."
    }
    scp $archivePath "${Server}:${RemoteDir}/.deploy-archive.tar"
    if ($LASTEXITCODE -ne 0) {
      throw "scp archive failed."
    }
    ssh $Server "set -e; cd $RemoteDir; tar xf .deploy-archive.tar; rm -f .deploy-archive.tar; chmod +x deploy-remote.sh; SKIP_GIT_PULL=1 bash deploy-remote.sh $Branch"
    if ($LASTEXITCODE -ne 0) {
      throw "remote deploy failed."
    }
  } finally {
    if (Test-Path $archivePath) {
      Remove-Item -Force $archivePath
    }
  }
}

$remoteGitPullCommand = "set -e; cd $RemoteDir; git checkout -- deploy-remote.sh deploy.ps1 2>/dev/null || true; git pull origin $Branch; chmod +x deploy-remote.sh; bash deploy-remote.sh $Branch"

Write-Host "==> Deploying on $Server..." -ForegroundColor Cyan
if ($LocalSync) {
  Sync-ArchiveToRemote
} else {
  ssh $Server $remoteGitPullCommand
  if ($LASTEXITCODE -ne 0) {
    throw @"
Remote deploy failed.

If the server cannot reach github.com, run:
  .\deploy.ps1 -LocalSync

That uploads code from your PC and skips git pull on the server.
"@
  }
}

Write-Host "==> Deploy completed." -ForegroundColor Green
