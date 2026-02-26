#!/bin/bash
# 上游项目同步脚本

set -e

echo "=========================================="
echo "CLIProxyAPIPlus 上游同步工具"
echo "=========================================="
echo ""

# 检查是否已初始化 git
if [ ! -d ".git" ]; then
    echo "初始化 Git 仓库..."
    git init
    git add .
    git commit -m "Initial commit with custom upstream endpoints feature"
    echo "✓ Git 仓库初始化完成"
    echo ""
fi

# 检查是否已添加上游远程仓库
if ! git remote | grep -q "^upstream$"; then
    echo "添加上游远程仓库..."
    git remote add upstream https://github.com/router-for-me/CLIProxyAPIPlus.git
    echo "✓ 上游仓库已添加"
    echo ""
fi

# 获取上游更新
echo "获取上游更新..."
git fetch upstream

# 显示上游更新内容
echo ""
echo "上游更新内容："
echo "----------------------------------------"
git log HEAD..upstream/main --oneline --max-count=10
echo "----------------------------------------"
echo ""

# 询问是否继续
read -p "是否继续合并上游更新？(y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消同步"
    exit 0
fi

# 创建同步分支
BRANCH_NAME="sync-upstream-$(date +%Y%m%d-%H%M%S)"
echo "创建同步分支: $BRANCH_NAME"
git checkout -b "$BRANCH_NAME"

# 尝试合并
echo "开始合并上游更新..."
if git merge upstream/main --no-edit; then
    echo ""
    echo "✓ 自动合并成功！"
    echo ""
    echo "请执行以下步骤："
    echo "1. 测试构建: go build ./cmd/server"
    echo "2. 测试功能是否正常"
    echo "3. 如果一切正常，合并到主分支: git checkout main && git merge $BRANCH_NAME"
else
    echo ""
    echo "⚠ 发现冲突，需要手动解决"
    echo ""
    echo "冲突文件："
    git status --short | grep "^UU"
    echo ""
    echo "请按照以下步骤解决冲突："
    echo "1. 参考 UPSTREAM_SYNC_GUIDE.md 中的'修改内容清单'"
    echo "2. 编辑冲突文件，保留我们的自定义功能"
    echo "3. 标记冲突已解决: git add <文件>"
    echo "4. 完成合并: git commit"
    echo "5. 测试构建: go build ./cmd/server"
fi
