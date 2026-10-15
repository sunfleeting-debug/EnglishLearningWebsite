param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$cacheDir = Join-Path $projectRoot 'tools\.cache'
$serverScript = Join-Path $projectRoot 'tools\local_dev.py'
$pidFile = Join-Path $cacheDir 'local-server.pid'
$pythonExe = Join-Path $cacheDir 'venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $pythonExe)) { $pythonExe = (Get-Command python.exe).Source }
New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
$serverProcess = $null
if (Test-Path -LiteralPath $pidFile) {
    $serverId = [int](Get-Content -LiteralPath $pidFile)
    $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$serverId"
    if ($serverProcess -and !$serverProcess.CommandLine.Contains($serverScript)) { $serverProcess = $null }
}
if (!$serverProcess) {
    foreach ($port in @(5173,8791)) {
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
            throw "Port $port is already in use. Stop that server first."
        }
    }
    $serverProcess = Start-Process -FilePath $pythonExe -ArgumentList @('-u', ('"' + $serverScript + '"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $cacheDir 'local-server.log') -RedirectStandardError (Join-Path $cacheDir 'local-server-error.log')
    Set-Content -LiteralPath $pidFile -Value $serverProcess.Id -Encoding Ascii
}
$ready = $false
for ($attempt=0; $attempt -lt 20; $attempt++) {
    try {
        $site = Invoke-WebRequest 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2
        $api = Invoke-RestMethod 'http://127.0.0.1:8791/api/health' -TimeoutSec 2
        if ($site.StatusCode -eq 200 -and $api.ok) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 250 }
}
if (!$ready) { throw "Server did not become ready. See $cacheDir\local-server-error.log" }
Write-Host 'Ready: http://127.0.0.1:5173/'
if (!$NoBrowser) { Start-Process 'http://127.0.0.1:5173/' }
