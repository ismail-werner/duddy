# Duddy audio/brightness worker. Long-lived: Duddy writes one command per line on stdin, this prints one JSON line back.
#   get | vol <0-100> | mute | bright <0-100> | app <pid> <0-100> | appmute <pid>
# Duddy only keeps it alive while the Volume tab is in use.
$ErrorActionPreference = 'Stop'
try { [Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal' } catch {} # background helper: never steal CPU from the animations
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Diagnostics; using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom {}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int EnumAudioEndpoints(int flow, int mask, out object devs); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int a(); int b(); int c(); int d();
  int SetMasterVolumeLevelScalar(float level, ref Guid ctx); int e();
  int GetMasterVolumeLevelScalar(out float level);
  int f(); int g(); int h(); int i();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 { int a(); int b(); int GetSessionEnumerator(out IAudioSessionEnumerator e); }
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator { int GetCount(out int n); int GetSession(int i, out IAudioSessionControl2 s); }
[Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
  int a(); int b(); int c(); int d(); int e(); int f(); int g(); int h(); int i(); int j(); int k();
  int GetProcessId(out uint pid);
}
[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
  int SetMasterVolume(float level, ref Guid ctx); int GetMasterVolume(out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx); int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
public class DuddyAudio {
  static Guid none = Guid.Empty;
  static IMMDevice Dev() { IMMDevice d; ((IMMDeviceEnumerator)new MMDeviceEnumeratorCom()).GetDefaultAudioEndpoint(0, 1, out d); return d; }
  static IAudioEndpointVolume Ep() { Guid iid = typeof(IAudioEndpointVolume).GUID; object o; Dev().Activate(ref iid, 23, IntPtr.Zero, out o); return (IAudioEndpointVolume)o; }
  public static int Vol() { float v; Ep().GetMasterVolumeLevelScalar(out v); return (int)Math.Round(v * 100); }
  public static bool Muted() { bool m; Ep().GetMute(out m); return m; }
  public static void SetVol(int p) { Ep().SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, p)) / 100f, ref none); }
  public static void ToggleMute() { var e = Ep(); bool m; e.GetMute(out m); e.SetMute(!m, ref none); }
  public static List<object[]> Apps() {
    Guid iid = typeof(IAudioSessionManager2).GUID; object o; Dev().Activate(ref iid, 23, IntPtr.Zero, out o);
    IAudioSessionEnumerator en; ((IAudioSessionManager2)o).GetSessionEnumerator(out en);
    int n; en.GetCount(out n); var list = new List<object[]>(); var seen = new HashSet<uint>();
    for (int i = 0; i < n; i++) {
      IAudioSessionControl2 c; en.GetSession(i, out c); uint pid; c.GetProcessId(out pid);
      if (pid == 0 || !seen.Add(pid)) continue;
      var v = (ISimpleAudioVolume)c; float l; bool m; v.GetMasterVolume(out l); v.GetMute(out m);
      string name = "app"; try { name = Process.GetProcessById((int)pid).ProcessName; } catch {}
      list.Add(new object[] { (int)pid, name, (int)Math.Round(l * 100), m });
    }
    return list;
  }
  static ISimpleAudioVolume Session(int pid) {
    Guid iid = typeof(IAudioSessionManager2).GUID; object o; Dev().Activate(ref iid, 23, IntPtr.Zero, out o);
    IAudioSessionEnumerator en; ((IAudioSessionManager2)o).GetSessionEnumerator(out en);
    int n; en.GetCount(out n);
    for (int i = 0; i < n; i++) { IAudioSessionControl2 c; en.GetSession(i, out c); uint p; c.GetProcessId(out p); if (p == (uint)pid) return (ISimpleAudioVolume)c; }
    return null;
  }
  public static void SetApp(int pid, int p) { var s = Session(pid); if (s != null) s.SetMasterVolume(Math.Max(0, Math.Min(100, p)) / 100f, ref none); }
  public static void ToggleApp(int pid) { var s = Session(pid); if (s == null) return; bool m; s.GetMute(out m); s.SetMute(!m, ref none); }
}
'@

function Bright { try { (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness } catch { $null } }

while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    $p = $line.Trim().Split(' ')
    switch ($p[0]) {
      'vol'     { [DuddyAudio]::SetVol([int]$p[1]) }
      'mute'    { [DuddyAudio]::ToggleMute() }
      'app'     { [DuddyAudio]::SetApp([int]$p[1], [int]$p[2]) }
      'appmute' { [DuddyAudio]::ToggleApp([int]$p[1]) }
      'bright'  { Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = [byte][Math]::Max(0, [Math]::Min(100, [int]$p[1])) } | Out-Null }
    }
    $apps = @([DuddyAudio]::Apps() | ForEach-Object { @{ pid = $_[0]; name = $_[1]; vol = $_[2]; mute = $_[3] } })
    @{ vol = [DuddyAudio]::Vol(); mute = [DuddyAudio]::Muted(); bright = (Bright); apps = $apps } | ConvertTo-Json -Compress -Depth 4
  } catch { @{ error = $_.Exception.Message } | ConvertTo-Json -Compress }
}
