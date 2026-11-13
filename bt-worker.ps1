# Duddy Bluetooth worker. Long-lived: Duddy writes one command per line on stdin, this prints JSON lines back.
#   list | connect <addr> | disconnect <addr> | mute <addr> | vol <addr> <0-100> | output <addr> | radio on|off      (<addr> = 12 hex digits)
# Duddy stops it again after a couple of minutes without a command.
param([switch]$Warm, [int]$Parent = 0) # -Warm: only build the cached DLL and exit
$ErrorActionPreference = 'Stop'
try { [Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal' } catch {} # background helper: never steal CPU from the animations
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$dll = Join-Path $env:APPDATA 'Duddy\bt-v1.dll' # bump the number when the C# below changes
$code = @'
using System; using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct STIME { public ushort a, b, c, d, e, f, g, h; }
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct BTDEV {
  public uint size; public ulong addr; public uint cod; public int connected, remembered, authenticated; public STIME seen, used;
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 248)] public string name;
}
public static class Bt { // paired-device state and the service switches that connect / disconnect a device
  [DllImport("bthprops.cpl", SetLastError = true)] static extern uint BluetoothGetDeviceInfo(IntPtr r, ref BTDEV d);
  [DllImport("bthprops.cpl", SetLastError = true)] static extern uint BluetoothEnumerateInstalledServices(IntPtr r, ref BTDEV d, ref uint n, [Out] Guid[] g);
  [DllImport("bthprops.cpl", SetLastError = true)] static extern uint BluetoothSetServiceState(IntPtr r, ref BTDEV d, ref Guid g, uint flags);
  public static BTDEV Info(ulong addr) { var d = new BTDEV(); d.size = (uint)Marshal.SizeOf(typeof(BTDEV)); d.addr = addr; uint e = BluetoothGetDeviceInfo(IntPtr.Zero, ref d); if (e != 0) throw new Exception("info " + e); return d; }
  public static Guid[] Services(ulong addr) { var d = Info(addr); uint n = 32; var g = new Guid[32]; uint e = BluetoothEnumerateInstalledServices(IntPtr.Zero, ref d, ref n, g); if (e != 0) throw new Exception("services " + e); Array.Resize(ref g, (int)n); return g; }
  public static uint SetService(ulong addr, Guid svc, bool on) { var d = Info(addr); return BluetoothSetServiceState(IntPtr.Zero, ref d, ref svc, on ? 1u : 0u); }
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom {}
[ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] class PolicyConfigClient {}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out object devs);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev);
  [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice dev);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  [PreserveSig] int OpenPropertyStore(int access, out IntPtr store);
  [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
}
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  [PreserveSig] int RegisterControlChangeNotify(IntPtr cb); [PreserveSig] int UnregisterControlChangeNotify(IntPtr cb); [PreserveSig] int GetChannelCount(out uint n);
  [PreserveSig] int SetMasterVolumeLevel(float db, ref Guid ctx); [PreserveSig] int SetMasterVolumeLevelScalar(float v, ref Guid ctx); [PreserveSig] int GetMasterVolumeLevel(out float db);
  [PreserveSig] int GetMasterVolumeLevelScalar(out float v);
  [PreserveSig] int SetChannelVolumeLevel(uint c, float db, ref Guid ctx); [PreserveSig] int SetChannelVolumeLevelScalar(uint c, float v, ref Guid ctx);
  [PreserveSig] int GetChannelVolumeLevel(uint c, out float db); [PreserveSig] int GetChannelVolumeLevelScalar(uint c, out float v);
  [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid ctx); [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
}
[Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPolicyConfig { // the call Windows' own sound settings use to pick the default output
  [PreserveSig] int M1(); [PreserveSig] int M2(); [PreserveSig] int M3(); [PreserveSig] int M4(); [PreserveSig] int M5(); [PreserveSig] int M6(); [PreserveSig] int M7(); [PreserveSig] int M8(); [PreserveSig] int M9(); [PreserveSig] int M10();
  [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
}
public static class Ep { // one audio output, by endpoint id
  static Guid none = Guid.Empty;
  static IMMDeviceEnumerator En() { return (IMMDeviceEnumerator)new MMDeviceEnumeratorCom(); }
  static IAudioEndpointVolume Vol(string id) { IMMDevice d; int h = En().GetDevice(id, out d); if (h != 0) throw new Exception("device " + h); Guid iid = typeof(IAudioEndpointVolume).GUID; object o; d.Activate(ref iid, 23, IntPtr.Zero, out o); return (IAudioEndpointVolume)o; }
  public static string DefaultId() { IMMDevice d; En().GetDefaultAudioEndpoint(0, 1, out d); string id; d.GetId(out id); return id; }
  public static bool GetMute(string id) { bool m; Vol(id).GetMute(out m); return m; }
  public static void SetMute(string id, bool m) { Vol(id).SetMute(m, ref none); }
  public static int GetVol(string id) { float v; Vol(id).GetMasterVolumeLevelScalar(out v); return (int)Math.Round(v * 100); }
  public static void SetVol(string id, int p) { Vol(id).SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, p)) / 100f, ref none); }
  public static int SetDefault(string id) { var p = (IPolicyConfig)new PolicyConfigClient(); int r = 0; for (int role = 0; role < 3; role++) r |= p.SetDefaultEndpoint(id, role); return r; }
}
'@
if (-not (Test-Path $dll)) { New-Item -ItemType Directory -Force (Split-Path $dll) | Out-Null; Add-Type -TypeDefinition $code -OutputAssembly $dll -OutputType Library }
Add-Type -Path $dll
if ($Warm) { exit }

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$null = [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime]
$null = [Windows.Devices.Enumeration.DeviceInformationCollection, Windows.Devices.Enumeration, ContentType = WindowsRuntime]
$null = [Windows.Devices.Bluetooth.BluetoothDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime]
$radioOk = $true
try {
  $null = [Windows.Devices.Radios.Radio, Windows.Devices.Radios, ContentType = WindowsRuntime]
  $null = [Windows.Devices.Radios.RadioAccessStatus, Windows.Devices.Radios, ContentType = WindowsRuntime]
} catch { $radioOk = $false }

function Emit($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 6)); [Console]::Out.Flush() }
function Hex($a) { '{0:X12}' -f [uint64]$a }
function Radio {
  if (-not $radioOk) { return $null }
  try {
    $acc = Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
    if ([string]$acc -ne 'Allowed') { return $null }
    $all = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
    $all | Where-Object { [string]$_.Kind -eq 'Bluetooth' } | Select-Object -First 1
  } catch { $null }
}
function Kind($cod, $svc) {
  $maj = ($cod -shr 8) -band 0x1F; $min = ($cod -shr 2) -band 0x3F
  if ($svc -contains '112F' -or $svc -contains '1132' -or $maj -eq 2) { return 'phone' }
  if ($maj -eq 4 -or $svc -contains '110B' -or $svc -contains '111E') { if ($min -eq 1 -or $min -eq 2) { return 'headset' } elseif ($min -eq 5 -or $min -eq 7) { return 'speaker' } else { return 'headphones' } }
  if ($maj -eq 5) { $m = ($min -band 0x0F); if ($m -eq 1 -or $m -eq 2 -or $m -eq 3) { return 'gamepad' } elseif ((($min -shr 4) -band 3) -eq 1) { return 'keyboard' } elseif ((($min -shr 4) -band 3) -eq 2) { return 'mouse' } else { return 'gamepad' } }
  if ($maj -eq 1) { return 'computer' }
  'other'
}
function BtEndpoints($names) { # the audio outputs Windows made for Bluetooth: named after the device, or the generic "Bluetooth" adapter
  $base = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render'
  Get-ChildItem $base | ForEach-Object {
    if ((Get-ItemProperty $_.PSPath).DeviceState -ne 1) { return }
    $p = Get-ItemProperty (Join-Path $_.PSPath 'Properties') -ErrorAction SilentlyContinue
    $adapter = [string]$p.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'; $form = [string]$p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
    $mine = $adapter -match 'Bluetooth'; foreach ($n in $names) { if ($n -and $adapter -like "*$n*") { $mine = $true } }
    if ($mine) { [pscustomobject]@{ id = '{0.0.0.00000000}.' + $_.PSChildName; form = $form; adapter = $adapter } }
  }
}
$battery = @{}
function Devices {
  $col = Await ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync([Windows.Devices.Bluetooth.BluetoothDevice]::GetDeviceSelectorFromPairingState($true))) ([Windows.Devices.Enumeration.DeviceInformationCollection])
  $raw = foreach ($d in $col) {
    try {
      $b = Await ([Windows.Devices.Bluetooth.BluetoothDevice]::FromIdAsync($d.Id)) ([Windows.Devices.Bluetooth.BluetoothDevice])
      $a = [uint64]$b.BluetoothAddress; $info = [Bt]::Info($a)
      $svc = @([Bt]::Services($a) | ForEach-Object { $_.ToString().Substring(4, 4).ToUpper() })
      $cod = [uint32]$b.ClassOfDevice.RawValue; if ($cod -eq 0) { $cod = $info.cod }
      [pscustomobject]@{ a = $a; hex = (Hex $a); name = $b.Name; connected = ($info.connected -ne 0); svc = $svc; kind = (Kind $cod $svc) }
    } catch { }
  }
  $audioNames = @($raw | Where-Object { $_.connected -and ($_.kind -in 'headphones', 'headset', 'speaker') } | ForEach-Object { $_.name })
  $eps = @(BtEndpoints $audioNames); $def = [Ep]::DefaultId()
  $out = foreach ($r in $raw) {
    $audio = $r.kind -in 'headphones', 'headset', 'speaker'
    $mine = @($eps | Where-Object { $audio -and $r.connected -and ($audioNames.Count -le 1 -or $_.adapter -like "*$($r.name)*" -or $_.adapter -match 'Bluetooth') })
    $o = [ordered]@{ addr = $r.hex; name = $r.name; connected = $r.connected; kind = $r.kind; svc = $r.svc; audio = $audio; battery = $battery[$r.hex]; muted = $false; vol = $null; isDefault = $false; hasOutput = ($mine.Count -gt 0) }
    if ($mine.Count) { try { $main = ($mine | Where-Object { $_.form -ne 'Headset' } | Select-Object -First 1); if (-not $main) { $main = $mine[0] }; $o.muted = [Ep]::GetMute($main.id); $o.vol = [Ep]::GetVol($main.id); $o.isDefault = ($mine.id -contains $def) } catch { } }
    $o
  }
  @($out | Sort-Object { -[int]$_.connected }, name)
}
$script:last = @()
function Send-List { $rad = Radio; $script:last = @(Devices); Emit @{ type = 'list'; radio = $(if ($rad) { [string]$rad.State -eq 'On' } else { $null }); devices = $script:last } }
function Battery-Node($addr) { # the battery level sits on the device's hands-free service node; find that node in the registry (instant), then read one property
  $base = 'HKLM:\SYSTEM\CurrentControlSet\Enum\BTHENUM'
  foreach ($k in (Get-ChildItem $base -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -like '{0000111E-*' })) {
    foreach ($i in (Get-ChildItem $k.PSPath -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match $addr })) { return 'BTHENUM\' + $k.PSChildName + '\' + $i.PSChildName }
  }
}
function Refresh-Battery { # once a minute per device, and only when no command is waiting
  $now = Get-Date
  foreach ($d in ($script:last | Where-Object { $_.connected -and $_.audio })) {
    if ($pending.IsCompleted) { return }
    if ($script:batAt -and $script:batAt[$d.addr] -and ($now - $script:batAt[$d.addr]).TotalSeconds -lt 60) { continue }
    if (-not $script:batAt) { $script:batAt = @{} }; $script:batAt[$d.addr] = $now
    try {
      $id = Battery-Node $d.addr; if (-not $id) { continue }
      $v = (Get-PnpDeviceProperty -InstanceId $id -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2' -ErrorAction SilentlyContinue).Data
      if ($null -ne $v) { $battery[$d.addr] = [int]$v; Emit @{ type = 'battery'; addr = $d.addr; value = [int]$v } }
    } catch { }
  }
}
function Switch-Service($hex, $on) {
  $a = [Convert]::ToUInt64($hex, 16)
  foreach ($g in [Bt]::Services($a)) { try { [void][Bt]::SetService($a, $g, $on) } catch { } }
  for ($i = 0; $i -lt 20; $i++) { Start-Sleep -Milliseconds 500; if (([Bt]::Info($a).connected -ne 0) -eq $on) { return $true } }
  $false
}
function Endpoints-For($hex) { $d = @(Devices) | Where-Object { $_.addr -eq $hex } | Select-Object -First 1; if ($d) { @(BtEndpoints @($d.name)) } else { @() } }

$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
$pending = $stdin.ReadLineAsync()
Send-List; Refresh-Battery
while ($true) {
  if (-not $pending.Wait(5000)) { if ($Parent -and -not (Get-Process -Id $Parent -ErrorAction SilentlyContinue)) { break }; continue }
  $line = $pending.Result; if ($null -eq $line) { break }; $pending = $stdin.ReadLineAsync()
  try {
    $p = $line.Trim().Split(' ')
    switch ($p[0]) {
      'list' { }
      'connect' { Emit @{ type = 'busy'; addr = $p[1]; op = 'connect' }; $ok = Switch-Service $p[1] $true; Emit @{ type = 'result'; addr = $p[1]; op = 'connect'; ok = $ok } }
      'disconnect' { Emit @{ type = 'busy'; addr = $p[1]; op = 'disconnect' }; $ok = Switch-Service $p[1] $false; Emit @{ type = 'result'; addr = $p[1]; op = 'disconnect'; ok = $ok } }
      'mute' { $eps = Endpoints-For $p[1]; if ($eps.Count) { $main = ($eps | Where-Object { $_.form -ne 'Headset' } | Select-Object -First 1); if (-not $main) { $main = $eps[0] }; $m = -not [Ep]::GetMute($main.id); foreach ($e in $eps) { try { [Ep]::SetMute($e.id, $m) } catch { } } } }
      'vol' { foreach ($e in (Endpoints-For $p[1])) { try { [Ep]::SetVol($e.id, [int]$p[2]) } catch { } } }
      'output' { # make this device the sound output, or go back to where the sound was before
        $eps = @(Endpoints-For $p[1]); $def = [Ep]::DefaultId(); $store = Join-Path $env:APPDATA 'Duddy\prev-output.txt'
        if ($eps.id -contains $def) { # already on this device: go back
          $prev = if (Test-Path $store) { (Get-Content $store -Raw).Trim() } else { $null }
          if ($prev -and $prev -ne $def) { [void][Ep]::SetDefault($prev) }
        } elseif ($eps.Count) {
          Set-Content $store $def -Encoding ascii
          foreach ($e in ($eps | Sort-Object { $_.form -eq 'Headset' })) { # prefer the stereo output, fall back to the headset one
            [void][Ep]::SetDefault($e.id); Start-Sleep -Milliseconds 300
            if ([Ep]::DefaultId() -eq $e.id) { break }
          }
          if ([Ep]::DefaultId() -eq $def) { Emit @{ type = 'error'; message = 'Windows would not switch the sound output to this device' } }
        }
      }
      'radio' { $r = Radio; if ($r) { [void](Await ($r.SetStateAsync($(if ($p[1] -eq 'on') { 'On' } else { 'Off' }))) ([Windows.Devices.Radios.RadioAccessStatus])); Start-Sleep -Milliseconds 800 } }
    }
    Send-List; if ($p[0] -in 'list', 'connect') { Refresh-Battery }
  } catch { Emit @{ type = 'error'; message = $_.Exception.Message } }
}
