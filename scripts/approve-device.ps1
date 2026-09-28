param([Parameter(Mandatory=$true)][ValidatePattern('^\d{6}$')][string]$Number)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object Windows.Forms.Form
$form.Text = 'XAU Desk - Device connection'
$form.Size = New-Object Drawing.Size(510,300)
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$label = New-Object Windows.Forms.Label
$label.Location = New-Object Drawing.Point(24,20)
$label.Size = New-Object Drawing.Size(450,145)
$label.Font = New-Object Drawing.Font('Segoe UI',12)
$label.Text = "มีอุปกรณ์ขอเชื่อมต่อ XAU Desk`n`nเลขยืนยัน: $Number`n`nอนุญาตเฉพาะเมื่อเลขตรงกับมือถือของคุณ`nอุปกรณ์นี้จะสั่งวิเคราะห์ผ่านคอมได้"
$yes = New-Object Windows.Forms.Button
$yes.Text = 'อนุญาต'
$yes.Location = New-Object Drawing.Point(255,185)
$yes.Size = New-Object Drawing.Size(210,45)
$yes.DialogResult = [Windows.Forms.DialogResult]::Yes
$no = New-Object Windows.Forms.Button
$no.Text = 'ปฏิเสธ'
$no.Location = New-Object Drawing.Point(25,185)
$no.Size = New-Object Drawing.Size(210,45)
$no.DialogResult = [Windows.Forms.DialogResult]::No
$form.Controls.AddRange(@($label,$yes,$no))
$form.CancelButton = $no
$form.AcceptButton = $no
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 150000
$timer.Add_Tick({ $form.Close() })
$timer.Start()
try { $result = $form.ShowDialog(); if ($result -eq [Windows.Forms.DialogResult]::Yes) { 'APPROVE' } else { 'REJECT' } }
finally { $timer.Stop(); $timer.Dispose(); $form.Dispose() }
