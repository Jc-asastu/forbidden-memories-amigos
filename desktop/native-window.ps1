param([int]$GamePid,[string]$Mode,[long]$WindowHandle=0)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class FMWindow {
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
}
"@
if($Mode -eq 'hide'){
 for($i=0;$i -lt 300;$i++){
  $game=Get-Process -Id $GamePid -ErrorAction SilentlyContinue
  if(!$game){exit 1}
  $game.Refresh();$handle=$game.MainWindowHandle
  if($handle -ne [IntPtr]::Zero){[void][FMWindow]::ShowWindow($handle,0);Write-Output $handle.ToInt64();exit 0}
  Start-Sleep -Milliseconds 100
 }
 exit 1
}
if($WindowHandle -eq 0){$game=Get-Process -Id $GamePid -ErrorAction SilentlyContinue;if(!$game){exit 1};$game.Refresh();$WindowHandle=$game.MainWindowHandle.ToInt64()}
$handle=[IntPtr]::new($WindowHandle);[uint32]$owner=0
[void][FMWindow]::GetWindowThreadProcessId($handle,[ref]$owner)
if($owner -ne $GamePid){exit 1}
[void][FMWindow]::ShowWindow($handle,9)
[void][FMWindow]::SetForegroundWindow($handle)
