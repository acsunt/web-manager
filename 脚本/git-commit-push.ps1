// 提交并推送当前工作树到 https://github.com/acsunt/web-manager
// 用法： gsudo powershell -ExecutionPolicy Bypass -File 脚本\git-commit-push.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

git remote remove origin 2>$null
git remote add origin https://github.com/acsunt/web-manager.git

git add -A

# PowerShell 不支持 git commit -m 多段正文，说明写进文件再用 -F。
# 用 UTF-8 无 BOM，避免中文提交说明被 Git 读成乱码。
$msgFile = Join-Path $env:TEMP 'web-manager-commit-msg.txt'
$msg = @'
feat: 简短标题

新增
- 做了什么

优化
- 改了什么体验或性能

修复
- 修了什么问题
'@
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($msgFile, $msg.Replace("`r`n", "`n") + "`n", $utf8)
git commit -F $msgFile

git push -u origin main
Write-Host '[完成] 已推送到 origin/main'