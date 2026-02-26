# 上游 API 地址配置 - Windows PowerShell 自动修改脚本
# 使用方法: .\apply-upstream-config.ps1

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "CLIProxyAPIPlus 上游 API 配置修改脚本" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否在项目根目录
if (-not (Test-Path "go.mod")) {
    Write-Host "错误: 请在项目根目录运行此脚本" -ForegroundColor Red
    exit 1
}

Write-Host "步骤 1/5: 备份原始文件..." -ForegroundColor Yellow
Copy-Item "internal\config\config.go" "internal\config\config.go.backup" -Force
Copy-Item "internal\runtime\executor\antigravity_executor.go" "internal\runtime\executor\antigravity_executor.go.backup" -Force
Copy-Item "internal\runtime\executor\gemini_cli_executor.go" "internal\runtime\executor\gemini_cli_executor.go.backup" -Force
Copy-Item "config.example.yaml" "config.example.yaml.backup" -Force
Write-Host "✓ 备份完成" -ForegroundColor Green
Write-Host ""

Write-Host "步骤 2/5: 修改 config.go..." -ForegroundColor Yellow
$configFile = "internal\config\config.go"
$content = Get-Content $configFile -Raw

# 添加 UpstreamEndpoints 字段到 Config 结构体
$pattern1 = '(\s+IncognitoBrowser bool `yaml:"incognito-browser" json:"incognito-browser"`\s+)(legacyMigrationPending bool)'
$replacement1 = '$1' + @"

	// UpstreamEndpoints defines custom upstream API endpoints for OAuth providers.
	// If not specified, default endpoints will be used.
	UpstreamEndpoints UpstreamEndpoints ``yaml:"upstream-endpoints" json:"upstream-endpoints"``

	$2
"@
$content = $content -replace $pattern1, $replacement1

# 添加 UpstreamEndpoints 结构体定义
$pattern2 = '(type ClaudeHeaderDefaults struct \{[^}]+\})'
$replacement2 = '$1' + @"


// UpstreamEndpoints defines custom upstream API endpoints for OAuth providers.
type UpstreamEndpoints struct {
	// AntigravityBaseURL is the base URL for Antigravity API.
	// Default: https://cloudcode-pa.googleapis.com
	AntigravityBaseURL string ``yaml:"antigravity-base-url" json:"antigravity-base-url"``

	// GeminiCLIBaseURL is the base URL for Gemini CLI API.
	// Default: https://cloudcode-pa.googleapis.com
	GeminiCLIBaseURL string ``yaml:"gemini-cli-base-url" json:"gemini-cli-base-url"``
}
"@
$content = $content -replace $pattern2, $replacement2

Set-Content $configFile $content -NoNewline
Write-Host "✓ config.go 修改完成" -ForegroundColor Green
Write-Host ""

Write-Host "步骤 3/5: 修改 antigravity_executor.go..." -ForegroundColor Yellow
$antigravityFile = "internal\runtime\executor\antigravity_executor.go"
$content = Get-Content $antigravityFile -Raw

# 添加 getBaseURL 方法
$pattern = '(func \(e \*AntigravityExecutor\) Identifier\(\) string \{ return antigravityAuthType \})'
$replacement = '$1' + @"


// getBaseURL returns the configured or default Antigravity base URL.
func (e *AntigravityExecutor) getBaseURL() string {
	if e.cfg != nil && e.cfg.UpstreamEndpoints.AntigravityBaseURL != "" {
		return strings.TrimSuffix(e.cfg.UpstreamEndpoints.AntigravityBaseURL, "/")
	}
	return antigravityBaseURLProd
}
"@
$content = $content -replace $pattern, $replacement

# 替换硬编码的 URL（只替换实际使用的地方，不替换常量定义）
$content = $content -replace 'return antigravityBaseURLProd([^a-zA-Z])', 'return e.getBaseURL()$1'

Set-Content $antigravityFile $content -NoNewline
Write-Host "✓ antigravity_executor.go 修改完成" -ForegroundColor Green
Write-Host ""

Write-Host "步骤 4/5: 修改 gemini_cli_executor.go..." -ForegroundColor Yellow
$geminiFile = "internal\runtime\executor\gemini_cli_executor.go"
$content = Get-Content $geminiFile -Raw

# 添加 getBaseURL 方法
$pattern = '(func \(e \*GeminiCLIExecutor\) Identifier\(\) string \{ return "gemini-cli" \})'
$replacement = '$1' + @"


// getBaseURL returns the configured or default Gemini CLI base URL.
func (e *GeminiCLIExecutor) getBaseURL() string {
	if e.cfg != nil && e.cfg.UpstreamEndpoints.GeminiCLIBaseURL != "" {
		return strings.TrimSuffix(e.cfg.UpstreamEndpoints.GeminiCLIBaseURL, "/")
	}
	return codeAssistEndpoint
}
"@
$content = $content -replace $pattern, $replacement

Set-Content $geminiFile $content -NoNewline
Write-Host "✓ gemini_cli_executor.go 修改完成" -ForegroundColor Green
Write-Host ""

Write-Host "步骤 5/5: 更新 config.example.yaml..." -ForegroundColor Yellow
$configExample = @"

# Upstream API endpoints configuration (optional)
# If not specified, default endpoints will be used
# upstream-endpoints:
#   # Antigravity (Google Cloud Code Assist) base URL
#   antigravity-base-url: "https://cloudcode-pa.googleapis.com"
#
#   # Gemini CLI base URL
#   gemini-cli-base-url: "https://cloudcode-pa.googleapis.com"
"@
Add-Content "config.example.yaml" $configExample
Write-Host "✓ config.example.yaml 已更新" -ForegroundColor Green
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "修改完成！" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步:" -ForegroundColor Yellow
Write-Host "1. 运行 'go build' 测试编译" -ForegroundColor White
Write-Host "2. 在 config.yaml 中添加自定义配置" -ForegroundColor White
Write-Host "3. 重启服务测试" -ForegroundColor White
Write-Host ""
Write-Host "配置示例:" -ForegroundColor Yellow
Write-Host @"
upstream-endpoints:
  antigravity-base-url: "https://your-custom-api.com"
  gemini-cli-base-url: "https://your-custom-api.com"
"@ -ForegroundColor Gray
Write-Host ""

