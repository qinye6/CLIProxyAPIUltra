# 上游项目同步指南

## 概述

本项目基于 [CLIProxyAPIPlus](https://github.com/router-for-me/CLIProxyAPIPlus) 添加了认证文件上游地址可修改功能。本文档说明如何处理上游项目更新。

## 修改内容清单

### 1. 配置文件修改

**文件**: `internal/config/config.go`

**位置**: 第 153-202 行

**修改内容**: 扩展了 `UpstreamEndpoints` 结构体，添加了以下字段：
- `ClaudeAuthURL`
- `ClaudeTokenURL`
- `CodexAuthURL`
- `CodexTokenURL`
- `KiroAuthEndpoint`
- `KiroAPIEndpoint`
- `VertexBaseURL`
- `AIStudioBaseURL`

**原始代码**:
```go
// UpstreamEndpoints defines custom upstream API endpoints for OAuth providers.
type UpstreamEndpoints struct {
	AntigravityBaseURL string `yaml:"antigravity-base-url" json:"antigravity-base-url"`
	GeminiCLIBaseURL string `yaml:"gemini-cli-base-url" json:"gemini-cli-base-url"`
}
```

**修改后代码**: 见文件第 153-202 行

---

### 2. 配置示例文件修改

**文件**: `config.example.yaml`

**位置**: 第 381-407 行

**修改内容**: 添加了新的上游端点配置示例

**原始代码**:
```yaml
# upstream-endpoints:
#   antigravity-base-url: "https://cloudcode-pa.googleapis.com"
#   gemini-cli-base-url: "https://cloudcode-pa.googleapis.com"
```

**修改后代码**: 见文件第 381-407 行

---

### 3. Claude 认证模块修改

**文件**: `internal/auth/claude/anthropic_auth.go`

**修改点**:
1. 第 48-51 行: `ClaudeAuth` 结构体添加 `authURL` 和 `tokenURL` 字段
2. 第 61-77 行: `NewClaudeAuth` 函数添加配置读取逻辑
3. 第 112 行: 使用 `o.authURL` 替代硬编码 `AuthURL`
4. 第 175、252 行: 使用 `o.tokenURL` 替代硬编码 `TokenURL`

---

### 4. Codex 认证模块修改

**文件**: `internal/auth/codex/openai_auth.go`

**修改点**:
1. 第 33-37 行: `CodexAuth` 结构体添加 `authURL` 和 `tokenURL` 字段
2. 第 39-56 行: `NewCodexAuth` 函数添加配置读取逻辑
3. 第 82 行: 使用 `o.authURL` 替代硬编码 `AuthURL`
4. 第 112、198 行: 使用 `o.tokenURL` 替代硬编码 `TokenURL`

---

### 5. Kiro OAuth 模块修改

**文件**: `internal/auth/kiro/oauth.go`

**修改点**:
1. 第 43-47 行: `KiroOAuth` 结构体添加 `kiroAuthEndpoint` 字段
2. 第 49-66 行: `NewKiroOAuth` 函数添加配置读取逻辑
3. 第 194 行: 使用 `o.kiroAuthEndpoint` 替代硬编码 `kiroAuthEndpoint`
4. 第 260 行: 使用 `o.kiroAuthEndpoint` 替代硬编码 `kiroAuthEndpoint`

---

### 6. Kiro AWS 认证模块修改

**文件**: `internal/auth/kiro/aws_auth.go`

**修改点**:
1. 第 49-62 行: `NewKiroAuth` 函数添加配置读取逻辑

---

### 7. Antigravity 认证模块修改

**文件**: `internal/auth/antigravity/auth.go`

**修改点**:
1. 第 33-36 行: `AntigravityAuth` 结构体添加 `apiEndpoint` 字段
2. 第 38-56 行: `NewAntigravityAuth` 函数添加配置读取逻辑
3. 第 179 行: 使用 `o.apiEndpoint` 替代硬编码 `APIEndpoint`
4. 第 282 行: 使用 `o.apiEndpoint` 替代硬编码 `APIEndpoint`

---

## 上游项目更新处理方案

### 方案一：使用 Git 管理（推荐）

#### 1. 初始化 Git 仓库并添加上游远程仓库

```bash
cd C:/Users/22535/Downloads/CLIProxyAPIPlus-main

# 初始化 git 仓库
git init

# 添加所有文件
git add .
git commit -m "Initial commit with upstream endpoint configuration feature"

# 添加上游仓库
git remote add upstream https://github.com/router-for-me/CLIProxyAPIPlus.git

# 添加你自己的远程仓库（如果有）
git remote add origin <your-repo-url>
```

#### 2. 同步上游更新

```bash
# 获取上游更新
git fetch upstream

# 查看上游更新内容
git log HEAD..upstream/main --oneline

# 创建新分支进行合并
git checkout -b sync-upstream

# 合并上游更新
git merge upstream/main
```

#### 3. 处理冲突

如果出现冲突，Git 会提示冲突文件。根据本文档的"修改内容清单"，手动解决冲突：

```bash
# 查看冲突文件
git status

# 编辑冲突文件，保留我们的修改
# 参考本文档的修改内容清单

# 标记冲突已解决
git add <conflicted-files>

# 完成合并
git commit -m "Merge upstream updates with custom endpoint configuration"
```

#### 4. 测试并推送

```bash
# 测试构建
go build ./cmd/server

# 推送到你的仓库
git push origin sync-upstream
```

---

### 方案二：手动合并（不使用 Git）

#### 1. 下载上游最新版本

```bash
# 下载上游最新代码
curl -L https://github.com/router-for-me/CLIProxyAPIPlus/archive/refs/heads/main.zip -o upstream-latest.zip

# 解压到临时目录
unzip upstream-latest.zip -d /tmp/upstream-latest
```

#### 2. 使用 diff 工具比较差异

```bash
# 比较配置文件
diff -u /tmp/upstream-latest/internal/config/config.go ./internal/config/config.go

# 比较认证模块
diff -u /tmp/upstream-latest/internal/auth/claude/anthropic_auth.go ./internal/auth/claude/anthropic_auth.go
```

#### 3. 手动应用更新

根据 diff 结果和本文档的"修改内容清单"，手动合并上游更新：

1. 复制上游新增的文件
2. 对于修改过的文件，手动合并更新内容
3. 保留我们添加的自定义端点配置功能

---

### 方案三：使用补丁文件（推荐用于自动化）

#### 1. 创建补丁文件

我已经为你准备了补丁文件，记录了所有修改内容。

#### 2. 应用补丁到新版本

```bash
# 下载上游最新版本
git clone https://github.com/router-for-me/CLIProxyAPIPlus.git upstream-new
cd upstream-new

# 应用补丁
git apply ../custom-upstream-endpoints.patch

# 如果有冲突，手动解决后继续
```

---

## 冲突解决指南

### 常见冲突场景

#### 场景 1: `internal/config/config.go` 中 `UpstreamEndpoints` 结构体冲突

**解决方法**:
1. 保留上游新增的字段
2. 添加我们的自定义字段（Claude、Codex、Kiro 等）
3. 确保没有重复定义

#### 场景 2: 认证模块构造函数冲突

**解决方法**:
1. 保留上游的逻辑
2. 在返回前添加配置读取逻辑
3. 确保字段初始化正确

#### 场景 3: 配置示例文件冲突

**解决方法**:
1. 保留上游新增的配置项
2. 保留我们的 `upstream-endpoints` 配置示例
3. 确保注释清晰

---

## 自动化脚本

### 创建同步脚本

```bash
#!/bin/bash
# sync-upstream.sh

set -e

echo "开始同步上游更新..."

# 获取上游更新
git fetch upstream

# 创建同步分支
BRANCH_NAME="sync-upstream-$(date +%Y%m%d)"
git checkout -b $BRANCH_NAME

# 尝试自动合并
if git merge upstream/main; then
    echo "自动合并成功！"
else
    echo "发现冲突，请手动解决："
    git status
    echo ""
    echo "参考 UPSTREAM_SYNC_GUIDE.md 解决冲突"
    exit 1
fi

# 测试构建
echo "测试构建..."
go build ./cmd/server

echo "同步完成！请检查并测试功能。"
```

---

## 测试清单

同步上游更新后，请执行以下测试：

### 1. 配置加载测试

```bash
# 测试配置文件解析
./server --config config.example.yaml --help
```

### 2. 认证模块测试

- [ ] Claude OAuth 认证流程
- [ ] Codex OAuth 认证流程
- [ ] Kiro OAuth 认证流程
- [ ] Antigravity 认证流程

### 3. 自定义端点测试

在 `config.yaml` 中配置自定义端点，验证是否生效：

```yaml
upstream-endpoints:
  claude-auth-url: "https://test.example.com/oauth/authorize"
```

### 4. 向后兼容性测试

- [ ] 不配置 `upstream-endpoints` 时使用默认地址
- [ ] 部分配置时正确回退到默认值

---

## 维护建议

### 1. 定期检查上游更新

```bash
# 每周检查一次
git fetch upstream
git log HEAD..upstream/main --oneline
```

### 2. 保持文档更新

每次同步后更新本文档，记录新的修改点。

### 3. 创建测试用例

为自定义端点功能创建自动化测试，确保更新后功能正常。

### 4. 使用分支管理

- `main`: 稳定版本
- `sync-upstream-*`: 同步分支
- `feature-*`: 新功能开发分支

---

## 贡献回上游

如果你的功能对社区有价值，可以考虑贡献回上游项目：

### 1. Fork 上游仓库

```bash
# 在 GitHub 上 Fork https://github.com/router-for-me/CLIProxyAPIPlus
```

### 2. 创建 Pull Request

```bash
git checkout -b feature/configurable-upstream-endpoints
git push origin feature/configurable-upstream-endpoints
# 在 GitHub 上创建 PR
```

### 3. PR 描述模板

```markdown
## 功能描述
添加认证文件上游地址可修改功能

## 修改内容
- 扩展 UpstreamEndpoints 配置结构
- 修改 Claude/Codex/Kiro/Antigravity 认证模块
- 更新配置示例文件

## 测试
- [x] 配置加载测试
- [x] 认证流程测试
- [x] 向后兼容性测试

## 相关 Issue
Closes #XXX
```

---

## 快速参考

### 修改文件列表

```
internal/config/config.go                    (配置结构)
config.example.yaml                          (配置示例)
internal/auth/claude/anthropic_auth.go       (Claude 认证)
internal/auth/codex/openai_auth.go           (Codex 认证)
internal/auth/kiro/oauth.go                  (Kiro OAuth)
internal/auth/kiro/aws_auth.go               (Kiro AWS)
internal/auth/antigravity/auth.go            (Antigravity)
```

### 关键修改点

1. **配置结构**: 添加 8 个新字段到 `UpstreamEndpoints`
2. **认证模块**: 在构造函数中读取配置，使用实例字段替代硬编码常量
3. **向后兼容**: 所有配置项可选，未配置时使用默认值

---

## 联系与支持

如有问题，请参考：
- 上游项目: https://github.com/router-for-me/CLIProxyAPIPlus
- 本文档: `UPSTREAM_SYNC_GUIDE.md`
- 修改总结: 见本文档"修改内容清单"部分

