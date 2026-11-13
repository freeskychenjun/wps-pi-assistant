param([int]$X = -1, [int]$Y = -1, [string]$Key = "", [string]$Out = "")
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class W6 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
$p = Get-Process wps -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne "" } | Select-Object -First 1
if (-not $p) { Write-Output "no-wps"; exit 2 }
$h = $p.MainWindowHandle
$fg = [W6]::GetForegroundWindow()
$fpid = 0
$tidFg = [W6]::GetWindowThreadProcessId($fg, [ref]$fpid)
$tidCur = [W6]::GetCurrentThreadId()
if ($tidFg -ne $tidCur) { [void][W6]::AttachThreadInput($tidFg, $tidCur, $true) }
[void][W6]::ShowWindow($h, 9)
[void][W6]::BringWindowToTop($h)
[void][W6]::SetForegroundWindow($h)
if ($tidFg -ne $tidCur) { [void][W6]::AttachThreadInput($tidFg, $tidCur, $false) }
Start-Sleep -Milliseconds 400
$sb = New-Object System.Text.StringBuilder 512
[void][W6]::GetWindowText([W6]::GetForegroundWindow(), $sb, 512)
Write-Output ("fg=" + $sb.ToString())
if ($X -ge 0) {
  [void][W6]::SetCursorPos($X, $Y)
  Start-Sleep -Milliseconds 120
  [W6]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 70
  [W6]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 450
}
if ($Key -ne "") { [System.Windows.Forms.SendKeys]::SendWait($Key); Start-Sleep -Milliseconds 500 }
if ($Out -ne "") {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output ("saved=" + $Out)
}
