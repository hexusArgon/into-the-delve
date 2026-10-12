# Держит Vite на 127.0.0.1:5180, пока запущен этот процесс.
# Второй экземпляр сразу выходит. Если порт погас, сервер поднимается снова.

$ErrorActionPreference = "Stop"
$root = "C:\Users\eseid\Projects\idos-solana-jam"
$npm = "D:\Programs\Node.js\npm.cmd"
$logDir = Join-Path $env:LOCALAPPDATA "idos-solana-jam"
$log = Join-Path $logDir "dev-server.log"
$outLog = Join-Path $logDir "vite.out.log"
$errLog = Join-Path $logDir "vite.err.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$mutex = New-Object System.Threading.Mutex($false, "Local\idos-solana-jam-dev-watch")
if (-not $mutex.WaitOne(0)) { exit 0 }

function Write-Log([string]$message) {
  Add-Content -Path $log -Value "$(Get-Date -Format o) $message"
}

function Test-DevPort {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $wait = $client.BeginConnect("127.0.0.1", 5180, $null, $null)
    $ok = $wait.AsyncWaitHandle.WaitOne(400, $false) -and $client.Connected
    return [bool]$ok
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

Write-Log "watch started"
$proc = $null
$startedAt = $null

while ($true) {
  $up = Test-DevPort
  $alive = $null -ne $proc -and -not $proc.HasExited
  if (-not $up) {
    $booting = $alive -and $null -ne $startedAt -and ((Get-Date) - $startedAt).TotalSeconds -lt 25
    if (-not $booting) {
      if ($alive) {
        Write-Log "port down, stop pid $($proc.Id)"
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
      }
      Write-Log "start npm run dev"
      $proc = Start-Process -FilePath $npm -ArgumentList @("run", "dev") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
      $startedAt = Get-Date
    }
  }
  Start-Sleep -Seconds 5
}
