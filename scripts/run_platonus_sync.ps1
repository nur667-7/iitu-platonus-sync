$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location -Path $rootDir

$hour = (Get-Date).Hour
$mode = if ($hour -lt 12) { "morning" } else { "evening" }

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$logFile = "$scriptDir\fallback_sync.log"

Add-Content -Path $logFile -Value "[$timestamp] Starting fallback sync check (mode=$mode)..."

& node "$rootDir\src\index.js" "--mode=$mode" "--source=fallback" *>> $logFile

$exitCode = $LASTEXITCODE
Add-Content -Path $logFile -Value "[$timestamp] Fallback finished with code: $exitCode`n"
