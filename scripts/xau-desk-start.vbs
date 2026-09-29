Option Explicit

Dim service, task
On Error Resume Next
Set service = CreateObject("Schedule.Service")
service.Connect
Set task = service.GetFolder("\").GetTask("XAU Desk Connector")
task.Run ""
If Err.Number <> 0 Then MsgBox "เปิด XAU Desk Connector ไม่สำเร็จ กรุณาตรวจ Task Scheduler", vbExclamation, "XAU Desk"
