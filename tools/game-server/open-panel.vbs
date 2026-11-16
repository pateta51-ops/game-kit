' Desktop icon: opens the panel, starting the game-server task first if it is not answering.
On Error Resume Next
u = "http://127.0.0.1:" & WScript.Arguments(0) & "/"
Set sh = CreateObject("WScript.Shell")
For i = 1 To 30
  Err.Clear
  Set h = CreateObject("MSXML2.ServerXMLHTTP")
  h.open "GET", u, False
  h.send
  If Err.Number = 0 Then If h.status = 200 Then Exit For
  If i = 1 Then sh.Run "schtasks /Run /TN game-server", 0, True
  WScript.Sleep 500
Next
sh.Run u
