$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location -Path $rootDir

$logFile = "$scriptDir\telegram_bot.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logFile -Value "[$timestamp] Starting NurbekOS Telegram Bot Daemon..."

while ($true) {
    try {
        & node "$rootDir\src\index.js" "--mode=telegram-bot" *>> $logFile
    } catch {
        $errTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Add-Content -Path $logFile -Value "[$errTime] Bot process exited with error: $_. Restarting in 5s..."
    }
    Start-Sleep -Seconds 5
}
