param(
    [string]$Action = "shot",
    [int]$X = 0,
    [int]$Y = 0,
    [string]$Out = "D:\DSH工作区\wps-pi-plugin\shot.png",
    [string]$TitleMatch = "",
    [string]$Text = ""
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Ui {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
}
'@

function Find-Window([string]$m) {
    $script:found = [IntPtr]::Zero
    $cb = [Ui+EnumWindowsProc]{
        param($h, $l)
        if ([Ui]::IsWindowVisible($h)) {
            $sb = New-Object System.Text.StringBuilder 512
            [void][Ui]::GetWindowText($h, $sb, 512)
            $t = $sb.ToString()
            if ($t -like "*$m*") { $script:found = $h; return $false }
        }
        return $true
    }
    [void][Ui]::EnumWindows($cb, [IntPtr]::Zero)
    return $script:found
}

function Take-Shot([string]$path) {
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen(0, 0, 0, 0, $b.Size)
    $bmp.Save($path)
    $g.Dispose(); $bmp.Dispose()
}

switch ($Action) {
    "focus" {
        $h = Find-Window $TitleMatch
        if ($h -ne [IntPtr]::Zero) { [void][Ui]::ShowWindow($h, 9); [void][Ui]::SetForegroundWindow($h); Start-Sleep -Milliseconds 800; "focused $h" }
        else { "not found: $TitleMatch" }
    }
    "click" {
        [void][Ui]::SetCursorPos($X, $Y)
        Start-Sleep -Milliseconds 150
        [Ui]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
        [Ui]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
        "clicked $X,$Y"
    }
    "shot" { Take-Shot $Out; "saved $Out" }    "max" {
        $h = Find-Window $TitleMatch
        if ($h -ne [IntPtr]::Zero) { [void][Ui]::ShowWindow($h, 3); [void][Ui]::SetForegroundWindow($h); Start-Sleep -Milliseconds 800; "maximized $h" }
        else { "not found: $TitleMatch" }
    }
    "type" {
        # 中文只能靠剪贴板粘贴（SendKeys 直接发中文会变成问号）
        Set-Clipboard -Value $Text
        Start-Sleep -Milliseconds 250
        [System.Windows.Forms.SendKeys]::SendWait("^v")
        Start-Sleep -Milliseconds 300
        "typed " + $Text.Length + " chars"
    }
    "key" {
        [System.Windows.Forms.SendKeys]::SendWait($Text)
        Start-Sleep -Milliseconds 300
        "sent key " + $Text
    }
    "shotfocus" {
        $h = Find-Window $TitleMatch
        if ($h -ne [IntPtr]::Zero) { [void][Ui]::ShowWindow($h, 9); [void][Ui]::SetForegroundWindow($h); Start-Sleep -Milliseconds 800 }
        Take-Shot $Out; "saved $Out"
    }
    "crop" {
        $src = [System.Drawing.Image]::FromFile($Out)
        $crop = New-Object System.Drawing.Bitmap(($W * 3), ($H * 3))
        $g2 = [System.Drawing.Graphics]::FromImage($crop)
        $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        $g2.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, ($W * 3), ($H * 3))), (New-Object System.Drawing.Rectangle($X, $Y, $W, $H)), [System.Drawing.GraphicsUnit]::Pixel)
        $crop.Save($CropOut)
        $g2.Dispose(); $crop.Dispose(); $src.Dispose()
        "saved $CropOut"
    }
}
