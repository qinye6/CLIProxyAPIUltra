# 上游 API 地址配置修改指南

## 修改概述

本指南将帮助你修改 CLIProxyAPIPlus 代码，使 ANTIGRAVITY 和 GEMINICLI 的上游 API 地址可以在 config.yaml 中配置。

## 需要修改的文件

1. `internal/config/config.go` - 添加配置结构
2. `internal/runtime/executor/antigravity_executor.go` - 使用配置
3. `internal/runtime/executor/gemini_cli_executor.go` - 使用配置
4. `config.example.yaml` - 添加配置示例

---

## 修改步骤

### 步骤 1: 修改 internal/config/config.go

#### 1.1 在 Config 结构体中添加字段

找到 `type Config struct` (约第27行)，在 `IncognitoBrowser` 字段后添加：

```go
// IncognitoBrowser enables opening OAuth URLs in incognito/private browsing mode.
IncognitoBrowser bool `yaml:"incognito-browser" json:"incognito-browser"`

// UpstreamEndpoints defines custom upstream API endpoints for OAuth providers.
// If not specified, default endpoints will be used.
UpstreamEndpoints UpstreamEndpoints `yaml:"upstream-endpoints" json:"upstream-endpoints"`

legacyMigrationPending bool `yaml:"-" json:"-"`
```

#### 1.2 添加 UpstreamEndpoints 结构体定义

在 `ClaudeHeaderDefaults` 结构体后添加（约第144行）：

```go
// UpstreamEndpoints defines custom upstream API endpoints for OAuth providers.
type UpstreamEndpoints struct {
	// AntigravityBaseURL is the base URL for Antigravity API.
	// Default: https://cloudcode-pa.googleapis.com
	AntigravityBaseURL string `yaml:"antigravity-base-url" json:"antigravity-base-url"`

	// GeminiCLIBaseURL is the base URL for Gemini CLI API.
	// Default: https://cloudcode-pa.googleapis.com
	GeminiCLIBaseURL string `yaml:"gemini-cli-base-url" json:"gemini-cli-base-url"`
}
```

---

### 步骤 2: 修改 internal/runtime/executor/antigravity_executor.go

#### 2.1 添加 getBaseURL 方法

在 `Identifier()` 方法后添加（约第76行）：

```go
// Identifier returns the executor identifier.
func (e *AntigravityExecutor) Identifier() string { return antigravityAuthType }

// getBaseURL returns the configured or default Antigravity base URL.
func (e *AntigravityExecutor) getBaseURL() string {
	if e.cfg != nil && e.cfg.UpstreamEndpoints.AntigravityBaseURL != "" {
		return strings.TrimSuffix(e.cfg.UpstreamEndpoints.AntigravityBaseURL, "/")
	}
	return antigravityBaseURLProd
}
```

#### 2.2 查找并替换所有使用硬编码 URL 的地方

使用编辑器的查找功能，在 `antigravity_executor.go` 文件中：

**查找**: `antigravityBaseURLProd`
**替换为**: `e.getBaseURL()`

这会影响约 3-5 处代码。

**注意**: 如果某些地方是在常量定义或注释中，不要替换。只替换实际使用的地方。

---

### 步骤 3: 修改 internal/runtime/executor/gemini_cli_executor.go

#### 3.1 添加 getBaseURL 方法

在 `Identifier()` 方法后添加（约第65行）：

```go
// Identifier returns the executor identifier.
func (e *GeminiCLIExecutor) Identifier() string { return "gemini-cli" }

// getBaseURL returns the configured or default Gemini CLI base URL.
func (e *GeminiCLIExecutor) getBaseURL() string {
	if e.cfg != nil && e.cfg.UpstreamEndpoints.GeminiCLIBaseURL != "" {
		return strings.TrimSuffix(e.cfg.UpstreamEndpoints.GeminiCLIBaseURL, "/")
	}
	return codeAssistEndpoint
}
```

#### 3.2 查找并替换所有使用硬编码 URL 的地方

使用编辑器的查找功能，在 `gemini_cli_executor.go` 文件中：

**查找**: `codeAssistEndpoint`
**替换为**: `e.getBaseURL()`

这会影响约 3-5 处代码。

---

### 步骤 4: 更新 config.example.yaml

在文件末尾添加配置示例：

```yaml
# Upstream API endpoints configuration (optional)
# If not specified, default endpoints will be used
# upstream-endpoints:
#   # Antigravity (Google Cloud Code Assist) base URL
#   antigravity-base-url: "https://cloudcode-pa.googleapis.com"
#
#   # Gemini CLI base URL
#   gemini-cli-base-url: "https://cloudcode-pa.googleapis.com"
```

---

## 验证修改

### 1. 编译测试

```bash
cd C:\Users\22535\Downloads\CLIProxyAPIPlus-main
go build -o server.exe
```

如果编译成功，说明语法正确。

### 2. 配置测试

创建 `config.yaml` 并添加：

```yaml
port: 8317

# 自定义上游地址
upstream-endpoints:
  antigravity-base-url: "https://your-custom-antigravity-api.com"
  gemini-cli-base-url: "https://your-custom-gemini-api.com"
```

### 3. 运行测试

```bash
./server.exe
```

查看日志，确认没有错误。

---

## 使用示例

### 默认配置（不指定上游地址）

```yaml
# config.yaml
port: 8317
# 不配置 upstream-endpoints，使用默认地址
```

默认行为：
- ANTIGRAVITY: `https://cloudcode-pa.googleapis.com`
- GEMINICLI: `https://cloudcode-pa.googleapis.com`

### 自定义配置

```yaml
# config.yaml
port: 8317

upstream-endpoints:
  antigravity-base-url: "https://my-proxy.example.com/antigravity"
  gemini-cli-base-url: "https://my-proxy.example.com/gemini"
```

---

## 常见问题

### Q1: 修改后编译失败？

**A**: 检查：
1. 是否正确添加了 `UpstreamEndpoints` 结构体
2. 是否在 `Config` 结构体中添加了字段
3. Go 语法是否正确（逗号、括号等）

### Q2: 配置不生效？

**A**: 检查：
1. `config.yaml` 中的缩进是否正确（YAML 对缩进敏感）
2. 字段名是否正确（`antigravity-base-url` 不是 `antigravity_base_url`）
3. 是否重启了服务

### Q3: 如何验证配置是否生效？

**A**: 启用调试模式：

```yaml
debug: true
upstream-endpoints:
  antigravity-base-url: "https://test.example.com"
```

然后查看日志，应该能看到请求发往 `test.example.com`。

---

## 下一步

修改完成后，你可以：

1. ✅ 重新构建 Docker 镜像
2. ✅ 在 config.yaml 中配置自定义上游地址
3. ✅ 部署到服务器测试

如果需要帮助，请参考项目的 README 或提交 Issue。
