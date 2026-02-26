# 代码修改计划 - 允许配置上游 API 地址

## 修改目标

让 GEMINICLI 和 ANTIGRAVITY 的上游 API 地址可以在 config.yaml 中配置。

## 需要修改的文件

1. `internal/config/config.go` - 添加配置字段
2. `internal/runtime/executor/antigravity_executor.go` - 使用配置的地址
3. `internal/runtime/executor/gemini_cli_executor.go` - 使用配置的地址
4. `config.example.yaml` - 添加配置示例

## 修改步骤

### 步骤 1: 修改 config.go 添加配置字段
### 步骤 2: 修改 antigravity_executor.go 使用配置
### 步骤 3: 修改 gemini_cli_executor.go 使用配置
### 步骤 4: 更新 config.example.yaml

开始执行...
