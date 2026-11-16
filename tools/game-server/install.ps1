# Run once, elevated: sudo powershell -ExecutionPolicy Bypass -File tools\game-server\install.ps1
# Starts the panel at boot (before logon, as this user, no window) and at logon, and puts a "Game Server" icon on the desktop.
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node).Source
$ports = Get-Content (Join-Path $dir '..\..\ports.json') -Raw | ConvertFrom-Json
$ts = 'C:\Program Files\Tailscale\tailscale.exe'
$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$dir\server.mjs`"" -WorkingDirectory $dir
$boot = New-ScheduledTaskTrigger -AtStartup
$boot.Delay = 'PT30S'
$logon = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -Hidden -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
Stop-ScheduledTask -TaskName 'game-server' -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort $ports.panel.local -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Register-ScheduledTask -TaskName 'game-server' -Action $action -Trigger $boot, $logon -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'game-server'
& $ts serve --bg "--https=$($ports.panel.https)" "http://127.0.0.1:$($ports.panel.local)"
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Game Server.lnk'))
$lnk.TargetPath = 'wscript.exe'
$lnk.Arguments = "`"$dir\open-panel.vbs`" $($ports.panel.local)"
$lnk.IconLocation = "$dir\game-server.ico,0"
$lnk.Description = 'Update and serve the games over Tailscale'
$lnk.Save()
Write-Host "Panel: http://127.0.0.1:$($ports.panel.local) here, https://<this PC's tailnet name>:$($ports.panel.https) from the phone"
