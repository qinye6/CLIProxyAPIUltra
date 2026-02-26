# 上游项目同步脚本 (PowerShell)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "CLIProxyAPIPlus 上游同步工具" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否已初始化 git
if (-not (Test-Path ".git")) {
    Write-Host "初始化 Git 仓库..." -ForegroundColor Yellow
    git init
    git add .
    git commit -m "Initial commit with custom upstream endpoints feature"
    Write-Host "✓ Git 仓库初始化完成" -ForegroundColor Green
    Write-Host ""
}

# 检查是否已添加上游远程仓库
$remotes = git remote
if ($remotes -notcontains "upstream") {
    Write-Host "添加上游远程仓库..." -ForegroundColor Yellow
    git remote add upstream https://github.com/router-for-me/CLIProxyAPIPlus.git
    Write-Host "✓ 上游仓库已添加" -ForegroundColor Green
    Write-Host ""
}

# 获取上游更新
Write-Host "获取上游更新..." -ForegroundColor Yellow
git fetch upstream

# 显示上游更新内容
Write-Host ""
Write-Host "上游更新内容：" -ForegroundColor Cyan
Write-Host "----------------------------------------"
git log HEAD..upstream/main --oneline --max-count=10
Write-Host "----------------------------------------"
Write-Host ""

# 询问是否继续
$continue = Read-Host "是否继续合并上游更新？(y/n)"
if ($continue -ne "y" -and $continue -ne "Y") {
    Write-Host "已取消同步" -ForegroundColor Yellow
    exit 0
}

# 创建同步分支
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$branchName = "sync-upstream-$timestamp"
Write-Host "创建同步分支: $branchName" -ForegroundColor Yellow
git checkout -b $branchName

# 尝试合并
Write-Host "开始合并上游更新..." -ForegroundColor Yellow
$mergeResult = git merge upstream/main --no-edit 2>&1
$mergeExitCode = $LASTEXITCODE

if ($mergeExitCode -eq 0) {
    Write-Host ""
    Write-Host "✓ 自动合并成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "请执行以下步骤：" -ForegroundColor Cyan
    Write-Host "1. 测试构建: go build ./cmd/server"
    Write-Host "2. 测试功能是否正常"
    Write-Host "3. 如果一切正常，合并到主分支: git checkout main; git merge $branchName"
} else {
    Write-Host ""
    Write-Host "⚠ 发现冲突，需要手动解决" -ForegroundColor Red
    Write-Host ""
    Write-Host "冲突文件：" -ForegroundColor Yellow
    git status --short | Select-String "^UU"
    Write-Host ""
    Write-Host "请按照以下步骤解决冲突：" -ForegroundColor Cyan
    Write-Host "1. 参考 UPSTREAM_SYNC_GUIDE.md 中的'修改内容清单'"
    Write-Host "2. 编辑冲突文件，保留我们的自定义功能"
    Write-Host "3. 标记冲突已解决: git add <文件>"
    Write-Host "4. 完成合并: git commit"
    Write-Host "5. 测试构建: go build ./cmd/server"
}
