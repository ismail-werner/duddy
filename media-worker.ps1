# Duddy media worker. Long-lived: watches Windows' media session (Spotify, YouTube in a browser, any player) and prints one JSON line
# whenever something changed (and every 2 s while playing so the progress bar stays honest).
param([int]$Parent = 0)
# Commands, one per stdin line: play | next | prev | seek:<seconds> | quit
#   {"type":"state","title":..,"artist":..,"app":..,"playing":..,"seek":..,"pos":..,"dur":..}   or {"type":"state","none":true}
#   {"type":"art","key":"<title><artist>","mime":..,"data":"<base64>"}                          once per track
$ErrorActionPreference = 'Stop'
try { [Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal' } catch {} # background helper: never steal CPU from the animations
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
$pending = $stdin.ReadLineAsync() # waiting on this with a timeout = zero CPU between commands, and no compiler start-up
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$props = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$asRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IInputStream' }
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Session {
  $s = $mgr.GetSessions() | Where-Object { $_.SourceAppUserModelId -match 'spotify' } | Select-Object -First 1 # Spotify first, else whatever Windows shows
  if (-not $s) { $s = $mgr.GetCurrentSession() }
  $s
}
function Emit($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }

$lastSig = ''; $lastKey = ''; $tick = 0
while ($true) {
  $cmd = $null
  if ($pending.Wait(2000)) { $cmd = $pending.Result; if ($null -eq $cmd) { break }; $pending = $stdin.ReadLineAsync() }
  try {
    $s = Session
    if ($cmd) {
      if ($cmd -eq 'quit') { break }
      if ($s) {
        if ($cmd -eq 'play') { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
        elseif ($cmd -eq 'next') { $null = Await ($s.TrySkipNextAsync()) ([bool]) }
        elseif ($cmd -eq 'prev') { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) }
        elseif ($cmd -like 'seek:*') { $null = Await ($s.TryChangePlaybackPositionAsync([long]([double]$cmd.Substring(5) * 10000000))) ([bool]) }
        Start-Sleep -Milliseconds 700 # let the player settle before we read it back (Spotify reports a beat late)
      }
    }
    if (-not $s) { if ($lastSig -ne 'none') { Emit @{ type = 'state'; none = $true }; $lastSig = 'none'; $lastKey = '' }; continue }
    $p = Await ($s.TryGetMediaPropertiesAsync()) $props
    $t = $s.GetTimelineProperties(); $i = $s.GetPlaybackInfo()
    $st = [ordered]@{ type = 'state'; title = $p.Title; artist = $p.Artist; app = $s.SourceAppUserModelId
      playing = ([string]$i.PlaybackStatus -eq 'Playing'); seek = [bool]$i.Controls.IsPlaybackPositionEnabled
      pos = [int]$t.Position.TotalSeconds; dur = [int]$t.EndTime.TotalSeconds }
    $sig = "$($st.title)|$($st.artist)|$($st.playing)|$($st.seek)|$($st.dur)"
    $tick++
    if ($cmd -or $sig -ne $lastSig -or ($st.playing -and $tick % 3 -eq 0)) { Emit $st } # while playing: re-sync the position every ~6 s
    $lastSig = $sig
    $key = "$($st.title)$($st.artist)"
    if ($key -ne $lastKey) {
      $lastKey = $key
      if ($p.Thumbnail) {
        try {
          $stream = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
          $ms = New-Object System.IO.MemoryStream; $asRead.Invoke($null, @($stream)).CopyTo($ms)
          Emit @{ type = 'art'; key = $key; mime = $stream.ContentType; data = [Convert]::ToBase64String($ms.ToArray()) }
        } catch { }
      }
    }
  } catch { }
}
