# Duddy notification watcher: prints one JSON line per NEW Windows toast notification (app, title, body).
# Only runs while "Windows notifications" is switched on in Duddy's settings. Existing notifications are ignored.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$null = [Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications.Management, ContentType = WindowsRuntime]
$null = [Windows.UI.Notifications.UserNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.UI.Notifications.NotificationKinds, Windows.UI.Notifications, ContentType = WindowsRuntime]
$type = [System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]]
$l = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
if ([string]$l.GetAccessStatus() -ne 'Allowed') { '{"error":"Windows has not allowed notification access (Settings > Privacy > Notifications)"}'; exit }
$junk = [regex]("[" + ((0x34f,0x200b,0x200c,0x200d,0x200e,0x200f,0x2060,0xfeff,0xad | ForEach-Object { [string][char]$_ }) -join "") + "]") # invisible padding chars some mails add
$seen = $null
while ($true) {
  try {
    $list = Await ($l.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)) $type
    $now = New-Object 'System.Collections.Generic.HashSet[uint32]'
    foreach ($n in $list) {
      [void]$now.Add($n.Id)
      if ($null -ne $seen -and -not $seen.Contains($n.Id)) {
        $texts = @($n.Notification.Visual.GetBinding('ToastGeneric').GetTextElements() | ForEach-Object { $junk.Replace($_.Text, '').Trim() } | Where-Object { $_ })
        @{ id = $n.Id; app = $n.AppInfo.DisplayInfo.DisplayName; title = [string]$texts[0]
           body = (($texts | Select-Object -Skip 1) -join ' ').Substring(0, [Math]::Min(220, (($texts | Select-Object -Skip 1) -join ' ').Length))
           ts = [DateTimeOffset]::Now.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress
      }
    }
    $seen = $now
  } catch { }
  Start-Sleep -Seconds 4
}
