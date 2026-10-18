# Duddy media bridge: talks to Windows' media session (Spotify, browsers, any player). Usage: media.ps1 info|art|play|next|prev|seek:<seconds>
param([string]$a = 'info')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
try {
  $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  $s = $mgr.GetSessions() | Where-Object { $_.SourceAppUserModelId -match 'spotify' } | Select-Object -First 1
  if (-not $s) { $s = $mgr.GetCurrentSession() }
  if (-not $s) { '{"none":true}'; exit }
  $props = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
  if ($a -like 'seek:*') { $sec = [double]$a.Substring(5); $null = Await ($s.TryChangePlaybackPositionAsync([long]($sec * 10000000))) ([bool]); Start-Sleep -Milliseconds 300 }
  switch ($a) {
    'play' { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]); Start-Sleep -Milliseconds 300 }
    'next' { $null = Await ($s.TrySkipNextAsync()) ([bool]); Start-Sleep -Milliseconds 500 }
    'prev' { $null = Await ($s.TrySkipPreviousAsync()) ([bool]); Start-Sleep -Milliseconds 500 }
  }
  $p = Await ($s.TryGetMediaPropertiesAsync()) $props
  if ($a -eq 'art') {
    if (-not $p.Thumbnail) { '{"none":true}'; exit }
    $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $asRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IInputStream' }
    $in = $asRead.Invoke($null, @($st))
    $ms = New-Object System.IO.MemoryStream; $in.CopyTo($ms)
    @{ mime = $st.ContentType; data = [Convert]::ToBase64String($ms.ToArray()) } | ConvertTo-Json -Compress
    exit
  }
  $t = $s.GetTimelineProperties()
  [pscustomobject]@{
    title = $p.Title; artist = $p.Artist; app = $s.SourceAppUserModelId
    playing = ([string]$s.GetPlaybackInfo().PlaybackStatus -eq 'Playing')
    seek = [bool]$s.GetPlaybackInfo().Controls.IsPlaybackPositionEnabled; pos = [int]$t.Position.TotalSeconds; dur = [int]$t.EndTime.TotalSeconds
  } | ConvertTo-Json -Compress
} catch { '{"none":true}' }
