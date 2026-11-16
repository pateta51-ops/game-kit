Set f = CreateObject("Scripting.FileSystemObject")
d = f.GetParentFolderName(WScript.ScriptFullName)
WScript.Quit CreateObject("WScript.Shell").Run("""" & WScript.Arguments(0) & """ """ & d & "\server.mjs""", 0, True)
