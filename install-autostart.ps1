# Register Maths Tutor to start automatically when you log in to Windows
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskName = "MathsTutorPublic"
$ScriptPath = Join-Path $ProjectRoot "start-public.ps1"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host "Autostart enabled: Maths Tutor will go public when you log in." -ForegroundColor Green
Write-Host "To disable: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
