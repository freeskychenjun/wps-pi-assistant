' hidden-run.vbs - start a command with NO console window at all.
'
' Why this exists:
'   When a scheduled task action is powershell.exe (or node.exe / python.exe),
'   Windows creates a console window for the process first and hides it a moment
'   later. On Windows 11 that console is handed to Windows Terminal, so the user
'   sees a black box flash on the desktop every time the task fires.
'   "-WindowStyle Hidden" cannot prevent that first console creation.
'   WScript.Shell.Run with window style 0 never creates a console at all.
'
' Usage:
'   wscript.exe //B hidden-run.vbs <exe> [arg1] [arg2] ...
'
' The third Run parameter is True (wait), so the wscript process stays alive as
' long as the child runs. Task Scheduler keeps the whole process tree alive only
' while the task's main process lives - that is what keeps the bridge running.

Option Explicit

Dim sh, args, cmd, i, rc

Set args = WScript.Arguments
If args.Count < 1 Then
    WScript.Quit 2
End If

cmd = Quote(args(0))
For i = 1 To args.Count - 1
    cmd = cmd & " " & Quote(args(i))
Next

Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = ParentDir(WScript.ScriptFullName)
rc = sh.Run(cmd, 0, True)
WScript.Quit rc

Function Quote(s)
    If InStr(s, " ") > 0 Then
        Quote = """" & s & """"
    Else
        Quote = s
    End If
End Function

Function ParentDir(p)
    Dim n
    n = InStrRev(p, "\")
    If n > 0 Then
        ParentDir = Left(p, n - 1)
    Else
        ParentDir = p
    End If
End Function
