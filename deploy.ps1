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

function Invoke-RemoteDeploy {
  param(
    [string]$RemoteCommand
  )
  ssh $Server $RemoteCommand
  if ($LASTEXITCODE -ne 0) {
    throw "Remote deploy failed."
  }
}

function Sync-ArchiveToRemote {
  Write-Host "==> Syncing branch '$Branch' to $Server via git archive (server git pull skipped)..." -ForegroundColor Yellow
  $archivePath = Join-Path ([System.IO.Path]::GetTempPath()) "ssp-deploy-$Branch.tar"
  $remoteArchive = "$RemoteDir/.deploy-archive.tar"
  try {
    if (Test-Path $archivePath) {
      Remove-Item -Force $archivePath
    }
    git archive --format=tar -o $archivePath $Branch
    if ($LASTEXITCODE -ne 0) {
      throw "git archive failed."
    }
    scp $archivePath "${Server}:${remoteArchive}"
    if ($LASTEXITCODE -ne 0) {
      throw "scp archive failed."
    }
    ssh $Server "set -e; cd $RemoteDir; tar xf .deploy-archive.tar; rm -f .deploy-archive.tar"
    if ($LASTEXITCODE -ne 0) {
      throw "remote tar extract failed."
    }
  } finally {
    if (Test-Path $archivePath) {
      Remove-Item -Force $archivePath
    }
  }
}

$remoteDeployCommand = "set -e; cd $RemoteDir; chmod +x deploy-remote.sh; SKIP_GIT_PULL=1 bash deploy-remote.sh $Branch"
$remoteGitPullCommand = "set -e; cd $RemoteDir; git pull origin $Branch; chmod +x deploy-remote.sh; bash deploy-remote.sh $Branch"

Write-Host "==> Deploying on $Server..." -ForegroundColor Cyan
if ($LocalSync) {
  Sync-ArchiveToRemote
  Invoke-RemoteDeploy $remoteDeployCommand
} else {
  ssh $Server $remoteGitPullCommand
  if ($LASTEXITCODE -ne 0) {
    Write-Host "==> Remote git pull failed (often DNS/github.com on the server). Retrying with local archive sync..." -ForegroundColor Yellow
    Sync-ArchiveToRemote
    Invoke-RemoteDeploy $remoteDeployCommand
  }
}

Write-Host "==> Deploy completed." -ForegroundColor Green
