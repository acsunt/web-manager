// 提交并推送当前工作树到 https://github.com/acsunt/web-manager
// 用法： gsudo powershell -ExecutionPolicy Bypass -File 脚本\git-commit-push.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

git remote remove origin 2>$null
git remote add origin https://github.com/acsunt/web-manager.git

git add -A

$msg = 'feat(13.3): 批量统一名称 + 名称双输入框 + 图标识别报告增强'
git commit -m $msg

git push -u origin main
Write-Host '[完成] 已推送到 origin/main'