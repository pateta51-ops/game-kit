$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node).Source
$ports = Get-Content (Join-Path $dir '..\..\ports.json') -Raw | ConvertFrom-Json
$ts = 'C:\Program Files\Tailscale\tailscale.exe'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$dir\launch.vbs`" `"$node`"" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -Hidden -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'game-server' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'game-server'
& $ts serve --bg "--https=$($ports.panel.https)" "http://127.0.0.1:$($ports.panel.local)"
Write-Host "Panel: https://REDACTED:$($ports.panel.https)"
