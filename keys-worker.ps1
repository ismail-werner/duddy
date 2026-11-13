# Duddy system-events helper: tells the island when the volume or brightness changes, Caps Lock flips, the keyboard language
# changes, or a different audio output (headphones...) becomes the default. One JSON line per event on stdout.
# Volume, brightness and audio devices are Windows events (no polling). Caps Lock and language are checked 3 times a second.
# It never looks at what you type: only the Caps Lock state and the keyboard layout are read.
param([switch]$Warm, [int]$Parent = 0) # -Warm: only build the cached DLL and exit (Duddy does this once, in the background)
$ErrorActionPreference = 'Stop'
try { [Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal' } catch {} # background helper: never steal CPU from the animations
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$dll = Join-Path $env:APPDATA 'Duddy\keys-v3.dll' # bump the number when the C# below changes
$code = @'
using System; using System.Collections.Concurrent; using System.Globalization; using System.Management; using System.Runtime.InteropServices; using System.Threading;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom {}
[StructLayout(LayoutKind.Sequential)] public struct PropertyKey { public Guid fmtid; public int pid; }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out object devs);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev);
  [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice dev);
  [PreserveSig] int RegisterEndpointNotificationCallback(IMMNotificationClient client);
  [PreserveSig] int UnregisterEndpointNotificationCallback(IMMNotificationClient client);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("7991EEC9-7E89-4D85-8390-6C703CEC60C0"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMNotificationClient {
  [PreserveSig] int OnDeviceStateChanged([MarshalAs(UnmanagedType.LPWStr)] string id, int state);
  [PreserveSig] int OnDeviceAdded([MarshalAs(UnmanagedType.LPWStr)] string id);
  [PreserveSig] int OnDeviceRemoved([MarshalAs(UnmanagedType.LPWStr)] string id);
  [PreserveSig] int OnDefaultDeviceChanged(int flow, int role, [MarshalAs(UnmanagedType.LPWStr)] string id);
  [PreserveSig] int OnPropertyValueChanged([MarshalAs(UnmanagedType.LPWStr)] string id, PropertyKey key);
}
[Guid("657804FA-D6AD-4496-8A60-352752AF4F89"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolumeCallback { [PreserveSig] int OnNotify(IntPtr data); }
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { [PreserveSig] int RegisterControlChangeNotify(IAudioEndpointVolumeCallback cb); [PreserveSig] int UnregisterControlChangeNotify(IAudioEndpointVolumeCallback cb); }
public class KeysHelper : IMMNotificationClient, IAudioEndpointVolumeCallback {
  public static BlockingCollection<string> Q = new BlockingCollection<string>();
  static KeysHelper me; static IAudioEndpointVolume ep; static IMMDeviceEnumerator en; static ManagementEventWatcher bw;
  [DllImport("user32.dll")] static extern short GetKeyState(int k);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint tid);
  public static void Start() {
    me = new KeysHelper(); en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
    en.RegisterEndpointNotificationCallback(me); WatchVolume();
    try { bw = new ManagementEventWatcher(new ManagementScope(@"root\wmi"), new WqlEventQuery("SELECT * FROM WmiMonitorBrightnessEvent")); bw.EventArrived += (s, e) => Q.Add("bright " + Convert.ToInt32(e.NewEvent["Brightness"])); bw.Start(); } catch { Q.Add("note brightness-events-unavailable"); }
    var t = new Thread(Poll); t.IsBackground = true; t.Start();
  }
  static void WatchVolume() { // follow whichever output is the default
    try {
      if (ep != null) try { ep.UnregisterControlChangeNotify(me); } catch {}
      IMMDevice d; en.GetDefaultAudioEndpoint(0, 1, out d); Guid iid = typeof(IAudioEndpointVolume).GUID; object o; d.Activate(ref iid, 23, IntPtr.Zero, out o);
      ep = (IAudioEndpointVolume)o; ep.RegisterControlChangeNotify(me);
    } catch {}
  }
  static string Lang(IntPtr w) { uint pid; uint tid = GetWindowThreadProcessId(w, out pid); int lcid = (int)(GetKeyboardLayout(tid).ToInt64() & 0xFFFF); try { return new CultureInfo(lcid).TwoLetterISOLanguageName.ToUpper(); } catch { return "??"; } }
  static void Poll() {
    bool caps = (GetKeyState(0x14) & 1) != 0; IntPtr win = GetForegroundWindow(); string lang = Lang(win);
    while (true) {
      Thread.Sleep(350);
      bool c = (GetKeyState(0x14) & 1) != 0; if (c != caps) { caps = c; Q.Add("caps " + (c ? 1 : 0)); }
      IntPtr w = GetForegroundWindow(); string l = Lang(w);
      if (w == win && l != lang) Q.Add("lang " + l); // only a change inside the same window counts, switching windows is not a language change
      win = w; lang = l;
    }
  }
  public int OnNotify(IntPtr p) { try { return Notify(p); } catch (Exception ex) { Q.Add("note notify-error " + ex.Message); return 0; } }
  int Notify(IntPtr p) { int muted = Marshal.ReadInt32(p, 16); float v = BitConverter.ToSingle(BitConverter.GetBytes(Marshal.ReadInt32(p, 20)), 0); Q.Add("vol " + (int)Math.Round(v * 100) + " " + (muted != 0 ? 1 : 0)); return 0; }
  public int OnDefaultDeviceChanged(int flow, int role, string id) { if (flow == 0 && role == 1) { WatchVolume(); Q.Add("dev " + id); } return 0; }
  public int OnDeviceStateChanged(string id, int state) { return 0; }
  public int OnDeviceAdded(string id) { return 0; }
  public int OnDeviceRemoved(string id) { return 0; }
  public int OnPropertyValueChanged(string id, PropertyKey key) { return 0; }
}
'@
if (-not (Test-Path $dll)) { New-Item -ItemType Directory -Force (Split-Path $dll) | Out-Null; Add-Type -TypeDefinition $code -OutputAssembly $dll -OutputType Library -ReferencedAssemblies 'System.Management' }
Add-Type -Path $dll -ReferencedAssemblies 'System.Management'
if ($Warm) { exit }

function Emit($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
function DeviceName($id) { # "{0.0.0.00000000}.{guid}" -> the friendly name Windows shows in its sound settings
  try { $g = ($id -split '\.')[-1]; $k = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\$g\Properties"
    (Get-ItemProperty -Path $k -ErrorAction Stop).'{a45c254e-df1c-4efd-8020-67d146a850e0},2' } catch { 'Audio output' }
}
[KeysHelper]::Start()
while ($true) {
  $e = $null
  if (-not [KeysHelper]::Q.TryTake([ref]$e, 30000)) { if ($Parent -and -not (Get-Process -Id $Parent -ErrorAction SilentlyContinue)) { exit }; continue } # idle: wakes every 30 s only to check Duddy is still there
  try {
    $p = $e -split ' ', 3
    switch ($p[0]) {
      'vol'    { Emit @{ type = 'vol'; vol = [int]$p[1]; mute = ($p[2] -eq '1') } }
      'bright' { Emit @{ type = 'bright'; value = [int]$p[1] } }
      'caps'   { Emit @{ type = 'caps'; on = ($p[1] -eq '1') } }
      'lang'   { Emit @{ type = 'lang'; code = $p[1] } }
      'dev'    { Emit @{ type = 'dev'; name = (DeviceName ($e.Substring(4))) } }
      'note'   { Emit @{ type = 'note'; text = $p[1] } }
    }
  } catch { [Console]::Error.WriteLine($_) }
}
