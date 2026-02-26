# Supabase Edge Function 部署指南

## 方法一：使用 Supabase CLI（推荐）

### 1. 安装 Supabase CLI

```bash
# Windows (使用 Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# 或使用 npm
npm install -g supabase

# 验证安装
supabase --version
```

### 2. 初始化项目

```bash
cd C:\Users\22535\Downloads\CLIProxyAPIPlus-main

# 初始化 Supabase 项目
supabase init
```

这会创建 `supabase/` 目录结构：
```
supabase/
├── config.toml
└── functions/
```

### 3. 创建 Edge Function

```bash
# 创建智能路由函数
supabase functions new smart-router
```

这会创建：
```
supabase/functions/smart-router/
└── index.ts
```

### 4. 复制优化后的代码

将 `supabase-smart-router-optimized.ts` 的内容复制到：
```
supabase/functions/smart-router/index.ts
```

### 5. 设置环境变量（Secrets）

```bash
# 登录 Supabase
supabase login

# 链接到你的项目
supabase link --project-ref your-project-ref

# 设置环境变量
supabase secrets set ANTIGRAVITY_HOST=api.antigravity.xxx
supabase secrets set GEMINICLI_HOST=api.geminicli.xxx
supabase secrets set DEBUG_MODE=false
supabase secrets set REQUEST_TIMEOUT=30000

# 查看已设置的环境变量
supabase secrets list
```

### 6. 部署函数

```bash
# 部署到 Supabase
supabase functions deploy smart-router

# 部署成功后会显示 URL
# https://your-project-ref.supabase.co/functions/v1/smart-router
```

---

## 方法二：使用 Supabase Dashboard（Web 界面）

### 1. 访问 Supabase Dashboard

打开浏览器访问：https://supabase.com/dashboard

### 2. 创建 Edge Function

1. 选择你的项目
2. 点击左侧菜单 **Edge Functions**
3. 点击 **Create a new function**
4. 输入函数名称：`smart-router`
5. 点击 **Create function**

### 3. 编辑函数代码

1. 在函数编辑器中，删除默认代码
2. 复制 `supabase-smart-router-optimized.ts` 的内容
3. 粘贴到编辑器
4. 点击 **Save** 或 **Deploy**

### 4. 设置环境变量（重要！）

#### 方式 A：通过 Dashboard 设置

1. 在 Edge Functions 页面，点击你的函数名称
2. 点击 **Settings** 标签
3. 找到 **Secrets** 或 **Environment Variables** 部分
4. 点击 **Add secret** 或 **Add variable**
5. 添加以下变量：

```
ANTIGRAVITY_HOST = api.antigravity.xxx
GEMINICLI_HOST = api.geminicli.xxx
DEBUG_MODE = false
REQUEST_TIMEOUT = 30000
```

6. 点击 **Save**
7. **重新部署函数**以使环境变量生效

#### 方式 B：通过项目设置

1. 点击左侧菜单 **Project Settings**
2. 点击 **Edge Functions**
3. 找到 **Secrets** 部分
4. 添加环境变量（同上）

### 5. 获取函数 URL

部署成功后，你的函数 URL 格式为：
```
https://your-project-ref.supabase.co/functions/v1/smart-router
```

你可以在 Edge Functions 页面找到完整的 URL。

---

## 方法三：使用 .env 文件（本地开发）

### 1. 创建本地环境变量文件

```bash
cd supabase/functions/smart-router
```

创建 `.env` 文件：

```bash
# supabase/functions/smart-router/.env
ANTIGRAVITY_HOST=api.antigravity.xxx
GEMINICLI_HOST=api.geminicli.xxx
DEBUG_MODE=true
REQUEST_TIMEOUT=30000
```

### 2. 本地测试

```bash
# 启动本地 Supabase
supabase start

# 运行函数（会自动加载 .env）
supabase functions serve smart-router

# 测试函数
curl -X POST http://localhost:54321/functions/v1/smart-router/api/smartgemini/test \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**注意**：`.env` 文件仅用于本地开发，不会部署到生产环境。生产环境必须使用 `supabase secrets set`。

---

## 常见问题

### Q1: 找不到 Project Ref 怎么办？

**A**: 在 Supabase Dashboard 中：
1. 打开你的项目
2. 点击左侧 **Project Settings**
3. 在 **General** 标签下找到 **Reference ID**
4. 复制这个 ID（格式类似：`abcdefghijklmnop`）

### Q2: 环境变量设置后不生效？

**A**: 需要重新部署函数：
```bash
supabase functions deploy smart-router --no-verify-jwt
```

或在 Dashboard 中点击 **Deploy** 按钮。

### Q3: 如何验证环境变量是否设置成功？

**A**: 在函数代码中添加日志：
```typescript
console.log("ANTIGRAVITY_HOST:", Deno.env.get("ANTIGRAVITY_HOST"));
```

然后查看函数日志：
```bash
supabase functions logs smart-router
```

### Q4: 本地开发时如何使用环境变量？

**A**: 创建 `.env.local` 文件（不会被 git 追踪）：
```bash
# supabase/.env.local
ANTIGRAVITY_HOST=localhost:8001
GEMINICLI_HOST=localhost:8002
DEBUG_MODE=true
```

---

## 完整部署流程示例

```bash
# 1. 初始化项目
cd C:\Users\22535\Downloads\CLIProxyAPIPlus-main
supabase init

# 2. 创建函数
supabase functions new smart-router

# 3. 复制代码
# 手动复制 supabase-smart-router-optimized.ts 到
# supabase/functions/smart-router/index.ts

# 4. 登录并链接项目
supabase login
supabase link --project-ref your-project-ref

# 5. 设置环境变量
supabase secrets set ANTIGRAVITY_HOST=api.antigravity.xxx
supabase secrets set GEMINICLI_HOST=api.geminicli.xxx
supabase secrets set DEBUG_MODE=false

# 6. 部署
supabase functions deploy smart-router

# 7. 测试
curl https://your-project-ref.supabase.co/functions/v1/smart-router/api/smartgemini/test
```

---

## 环境变量优先级

1. **生产环境**: `supabase secrets set` 设置的值
2. **本地开发**: `.env` 或 `.env.local` 文件
3. **代码默认值**: `Deno.env.get("KEY") || "default"`

---

## 下一步

设置完 Supabase 后，继续配置 Cloudflare Workers：
参考 `OPTIMIZATION_GUIDE.md` 中的 "步骤 2: 部署 Cloudflare Workers"

GEMINICLI 上游API: https://generativelanguage.googleapis.com
ANTIGRAVITY 上游API: https://cloudcode-pa.googleapis.com/v1internal
但是CLIProxyAPIPlus这个反代项目中的上游api地址是写死的我该怎么办？

