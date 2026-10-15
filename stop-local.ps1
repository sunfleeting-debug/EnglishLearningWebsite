$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'tools\.cache\local-server.pid'
$serverScript = Join-Path $PSScriptRoot 'tools\local_dev.py'
if (Test-Path -LiteralPath $pidFile) {
    $serverId = [int](Get-Content -LiteralPath $pidFile)
    $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$serverId"
    if ($serverProcess -and $serverProcess.CommandLine.Contains($serverScript) -and $serverProcess.Name -match '^python(w)?\.exe$') {
        Stop-Process -Id $serverId -ErrorAction Stop
        Write-Host 'Local website and development API stopped.'
    }
    Remove-Item -LiteralPath $pidFile
}
