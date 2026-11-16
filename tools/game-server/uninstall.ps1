Stop-ScheduledTask -TaskName 'game-server' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'game-server' -Confirm:$false -ErrorAction SilentlyContinue
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ports = Get-Content (Join-Path $dir '..\..\ports.json') -Raw | ConvertFrom-Json
& 'C:\Program Files\Tailscale\tailscale.exe' serve "--https=$($ports.panel.https)" off
