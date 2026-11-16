Stop-ScheduledTask -TaskName 'game-server' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'game-server' -Confirm:$false -ErrorAction SilentlyContinue
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ports = Get-Content (Join-Path $dir '..\..\ports.json') -Raw | ConvertFrom-Json
Get-NetTCPConnection -LocalPort $ports.panel.local -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
& 'C:\Program Files\Tailscale\tailscale.exe' serve "--https=$($ports.panel.https)" off
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Game Server.lnk') -ErrorAction SilentlyContinue
