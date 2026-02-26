#!/bin/bash
# 上游 API 地址配置 - 自动修改脚本
# 使用方法: bash apply-upstream-config.sh

set -e

echo "=========================================="
echo "CLIProxyAPIPlus 上游 API 配置修改脚本"
echo "=========================================="
echo ""

# 检查是否在项目根目录
if [ ! -f "go.mod" ]; then
    echo "错误: 请在项目根目录运行此脚本"
    exit 1
fi

echo "步骤 1/4: 备份原始文件..."
cp internal/config/config.go internal/config/config.go.backup
cp internal/runtime/executor/antigravity_executor.go internal/runtime/executor/antigravity_executor.go.backup
cp internal/runtime/executor/gemini_cli_executor.go internal/runtime/executor/gemini_cli_executor.go.backup
cp config.example.yaml config.example.yaml.backup
echo "✓ 备份完成"
echo ""

echo "步骤 2/4: 修改 config.go..."
# 这里需要手动修改，因为 sed 在 Windows 上可能不可用
echo "请按照 UPSTREAM_CONFIG_MODIFICATION_GUIDE.md 中的步骤 1 手动修改"
echo ""

echo "步骤 3/4: 修改 executor 文件..."
echo "请按照 UPSTREAM_CONFIG_MODIFICATION_GUIDE.md 中的步骤 2 和 3 手动修改"
echo ""

echo "步骤 4/4: 更新配置示例..."
cat >> config.example.yaml << 'EOF'

# Upstream API endpoints configuration (optional)
# If not specified, default endpoints will be used
# upstream-endpoints:
#   # Antigravity (Google Cloud Code Assist) base URL
#   antigravity-base-url: "https://cloudcode-pa.googleapis.com"
#
#   # Gemini CLI base URL
#   gemini-cli-base-url: "https://cloudcode-pa.googleapis.com"
EOF
echo "✓ 配置示例已更新"
echo ""

echo "=========================================="
echo "修改完成！"
echo "=========================================="
echo ""
echo "下一步:"
echo "1. 按照指南手动修改 Go 代码文件"
echo "2. 运行 'go build' 测试编译"
echo "3. 更新 config.yaml 添加自定义配置"
echo ""
