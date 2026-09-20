param([ValidateSet('start','stop','backup')][string]$Action='start',[switch]$NoBrowser)
$ErrorActionPreference='Stop'
$projectRoot=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serverFile=Join-Path $projectRoot 'server\server.mjs'
$baseUrl='http://127.0.0.1:4317'
function Resolve-Node {
  $candidates=@($env:DAYFOLIO_NODE,(Join-Path $projectRoot 'runtime\node.exe'),(Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'))
  $available=Get-Command node -ErrorAction SilentlyContinue
  if($available){$candidates+=$available.Source}
  foreach($candidate in $candidates){if($candidate -and (Test-Path -LiteralPath $candidate)){try{$version=& $candidate --version;if($version -match '^v(\d+)' -and [int]$Matches[1] -ge 24){return $candidate}}catch{}}}
  throw 'Node.js 24 or newer is required. Install Node.js or set DAYFOLIO_NODE to node.exe.'
}
function Get-Health {
  try {return Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 2} catch {return $null}
}
function Get-OwnedProcess($health) {
  if(!$health -or $health.app -ne 'dayfolio-local'){return $null}
  $ownedProcess=Get-CimInstance Win32_Process -Filter "ProcessId = $($health.pid)"
  if($ownedProcess -and $ownedProcess.CommandLine -and $ownedProcess.CommandLine.Contains($serverFile)){return $ownedProcess}
  return $null
}
if($Action -eq 'backup'){
  $nodePath=Resolve-Node
  & $nodePath (Join-Path $PSScriptRoot 'backup.mjs')
  if($LASTEXITCODE -ne 0){throw 'Backup failed.'}
  exit 0
}
$health=Get-Health
if($Action -eq 'stop'){
  $ownedProcess=Get-OwnedProcess $health
  if($ownedProcess){Stop-Process -Id $ownedProcess.ProcessId;Write-Host 'Dayfolio stopped. Your records remain saved.'}
  elseif($health){throw 'The running service belongs to a different folder; it was not stopped.'}
  else{Write-Host 'Dayfolio is not running.'}
  exit 0
}
if($health){if(!(Get-OwnedProcess $health)){throw 'Port 4317 belongs to a different service.'}}
else {
  if(!(Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))){throw 'Built website missing. Run npm run build in this folder.'}
  $nodePath=Resolve-Node
  $logDir=Join-Path $projectRoot 'logs';New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $env:DAYFOLIO_PORT='4317'
  $env:DAYFOLIO_DATA_DIR=Join-Path $projectRoot 'data'
  $started=Start-Process -FilePath $nodePath -ArgumentList @(('"'+$serverFile+'"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'error.log')
  for($attempt=0;$attempt -lt 40;$attempt++){
    Start-Sleep -Milliseconds 250
    $health=Get-Health
    if($health -and $health.pid -eq $started.Id){break}
    if($started.HasExited){throw 'Dayfolio did not start. See logs/error.log.'}
  }
  if(!$health -or $health.pid -ne $started.Id){throw 'Startup timed out. See logs/error.log.'}
}
Write-Host "Dayfolio is ready: $baseUrl"
if(!$NoBrowser){Start-Process $baseUrl}
