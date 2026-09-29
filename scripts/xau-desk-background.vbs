Option Explicit

If WScript.Arguments.Count <> 4 Then WScript.Quit 2

Dim shell, variables, command, exitCode
Set shell = CreateObject("WScript.Shell")
Set variables = shell.Environment("PROCESS")
variables("XAU_DESK_PERSIST") = "1"
variables("XAU_DESK_SCHEDULED") = "1"
variables("XAU_DESK_STATE_DIR") = WScript.Arguments(2)
variables("CODEX_HOME") = WScript.Arguments(3)

command = Chr(34) & WScript.Arguments(0) & Chr(34) & " " & Chr(34) & WScript.Arguments(1) & Chr(34)
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
