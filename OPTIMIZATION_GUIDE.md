# 防截断 + 安全代理优化指南

## 架构概览

```
客户端请求
    ↓
Cloudflare Workers (防截断层)
    ↓
Supabase Edge Function (智能路由层)
    ↓
ANTIGRAVITY / GEMINICLI (上游 API)
```

## 主要优化点总结

### 1. Supabase 智能路由代理优化

#### ✅ 已优化项
- **环境变量配置**: 移除硬编码，支持运行时配置
- **增强路由逻辑**: 支持从请求体提取模型名称
- **请求追踪**: 添加 Request-ID 用于全链路追踪
- **错误处理**: 详细的错误分类和日志记录
- **超时控制**: 可配置的请求超时时间
- **性能监控**: 响应时间统计

#### 📝 配置示例
```bash
# Supabase 环境变量
ANTIGRAVITY_HOST=your-antigravity-api.com
GEMINICLI_HOST=your-geminicli-api.com
DEBUG_MODE=false
REQUEST_TIMEOUT=30000
```

#### 🔧 关键改进
1. **动态路由决策**
   - 从 URL 路径提取模型名
   - 从请求体 (body.model) 提取模型名
   - 返回路由决策原因和置信度

2. **请求体处理**
   - 避免重复读取 body stream
   - 正确处理 smartgemini 路由
   - 支持 gemininothink 禁用思考

3. **响应头增强**
   ```
   X-Request-ID: req_1234567890_abc123
   X-Response-Time: 1234ms
   X-Route-Decision: Exclusive model: gemini-2.5-pro
   X-Route-Confidence: high
   ```

---

### 2. Cloudflare Workers 防截断优化

#### ✅ 已优化项
- **移除 UUID 注入**: 不再在用户消息中注入追踪 ID
- **使用 HTTP Header 追踪**: 通过 X-Request-ID 传递
- **心跳间隔优化**: 从 5 秒改为 15 秒（可配置）
- **上游地址配置**: 指向 Supabase 智能路由
- **模型配置统一**: 通过环境变量管理

#### 📝 配置示例
```bash
# Cloudflare Workers 环境变量
UPSTREAM_URL_BASE=https://your-project.supabase.co/functions/v1/api/smartgemini
MAX_RETRIES=3
DEBUG_MODE=false
HEARTBEAT_INTERVAL=15000
REQUEST_TIMEOUT=30000

# 模型配置（逗号分隔）
TARGET_MODELS=gemini-2.5-pro,gemini-2.5-flash,claude-opus-4-6-thinking
NON_THINKING_MODELS=gemini-2.5-flash-lite,claude-sonnet-4-6
```

#### 🔧 关键改进
1. **移除侵入性追踪**
   ```javascript
   // ❌ 旧方式：在用户消息中注入
   const prefix = `(Net-Request-Random-ID: ${uuid}...`;

   // ✅ 新方式：使用 HTTP Header
   headers.set("X-Request-ID", generateRequestId());
   ```

2. **优化心跳机制**
   ```javascript
   // ❌ 旧方式：固定 5 秒
   setInterval(() => { ... }, 5000);

   // ✅ 新方式：可配置 15 秒
   setInterval(() => { ... }, config.heartbeatInterval);
   ```

3. **灵活的上游配置**
   ```javascript
   // ✅ 指向 Supabase 智能路由
   upstreamUrlBase: env.UPSTREAM_URL_BASE ||
     "https://your-project.supabase.co/functions/v1/api/smartgemini"
   ```

---

## 部署步骤

### 步骤 1: 部署 Supabase 智能路由

1. 创建 Supabase Edge Function
```bash
supabase functions new smart-router
```

2. 复制优化后的代码到 `functions/smart-router/index.ts`

3. 设置环境变量
```bash
supabase secrets set ANTIGRAVITY_HOST=api.antigravity.xxx
supabase secrets set GEMINICLI_HOST=api.geminicli.xxx
supabase secrets set DEBUG_MODE=false
```

4. 部署函数
```bash
supabase functions deploy smart-router
```

5. 获取函数 URL
```
https://your-project.supabase.co/functions/v1/smart-router
```

### 步骤 2: 部署 Cloudflare Workers

1. 创建 Worker
```bash
wrangler init cf-anti-truncate
```

2. 复制优化后的代码到 `src/index.js`

3. 配置 `wrangler.toml`
```toml
name = "cf-anti-truncate"
main = "src/index.js"
compatibility_date = "2024-01-01"

[vars]
UPSTREAM_URL_BASE = "https://your-project.supabase.co/functions/v1/api/smartgemini"
MAX_RETRIES = "3"
DEBUG_MODE = "false"
HEARTBEAT_INTERVAL = "15000"
```

4. 部署 Worker
```bash
wrangler deploy
```

### 步骤 3: 客户端配置

```javascript
// OpenAI SDK 配置示例
const openai = new OpenAI({
  baseURL: "https://your-worker.workers.dev/v1beta",
  apiKey: "your-gemini-api-key"
});

// 请求示例
const response = await openai.chat.completions.create({
  model: "gemini-2.5-pro", // 会自动路由到正确的上游
  messages: [{ role: "user", content: "Hello" }]
});
```

---

## 测试验证

### 1. 测试智能路由

```bash
# 测试独占 ANTIGRAVITY 模型
curl -X POST https://your-project.supabase.co/functions/v1/api/smartgemini/v1beta/models/gemini-3.1-pro-low:generateContent \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"test"}]}]}'

# 检查响应头
# X-Route-Decision: Exclusive model: gemini-3.1-pro-low
# X-Route-Confidence: high
```

### 2. 测试防截断

```bash
# 测试长响应
curl -X POST https://your-worker.workers.dev/v1beta/models/gemini-2.5-pro:streamGenerateContent \
  -H "X-Goog-Api-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "写一篇5000字的文章"}]}],
    "generationConfig": {"thinkingConfig": {"thinkingBudget": 1024}}
  }'

# 验证响应包含 [RESPONSE_BEGIN] 和 [RESPONSE_FINISHED]
```

### 3. 测试请求追踪

```bash
# 发送带追踪 ID 的请求
curl -X POST https://your-worker.workers.dev/... \
  -H "X-Request-ID: test-123" \
  ...

# 检查响应头包含相同的 Request-ID
# X-Request-ID: test-123
```

---

## 监控和调试

### 启用调试模式

```bash
# Supabase
supabase secrets set DEBUG_MODE=true

# Cloudflare Workers
wrangler secret put DEBUG_MODE
# 输入: true
```

### 查看日志

```bash
# Supabase 日志
supabase functions logs smart-router

# Cloudflare Workers 日志
wrangler tail
```

### 关键日志示例

```
[2024-01-01T12:00:00Z] [req_123] POST /api/smartgemini/v1beta/models/gemini-2.5-pro:generateContent
  └─ Target: https://api.geminicli.xxx/v1beta/models/gemini-2.5-pro:generateContent
[2024-01-01T12:00:01Z] [req_123] [Smart Router] Exclusive model: gemini-2.5-pro -> api.geminicli.xxx
[2024-01-01T12:00:02Z] [req_123] POST /api/smartgemini/... -> https://... [200] (1234ms)
```

---

## 性能优化建议

### 1. 缓存策略
- 对于相同模型的路由决策可以缓存
- 使用 Cloudflare KV 存储路由规则

### 2. 并发控制
- 限制单个客户端的并发请求数
- 使用 Cloudflare Rate Limiting

### 3. 超时设置
```javascript
// 根据模型调整超时时间
const timeout = modelName.includes("pro") ? 60000 : 30000;
```

### 4. 心跳优化
```javascript
// 仅在长时间无数据时发送心跳
let lastDataTime = Date.now();
if (Date.now() - lastDataTime > 10000) {
  sendHeartbeat();
}
```

---

## 常见问题

### Q1: 为什么要分两层？
**A**:
- CF Workers: 全球边缘节点，低延迟，处理防截断逻辑
- Supabase: 灵活的路由逻辑，易于更新模型配置

### Q2: 如何添加新模型？
**A**: 更新 Supabase 环境变量中的模型列表，无需重新部署

### Q3: 如何处理 API Key？
**A**:
- 客户端 → CF Workers: 使用 X-Goog-Api-Key header
- CF Workers → Supabase: 透传 header
- Supabase → 上游: 透传 header

### Q4: 性能开销有多大？
**A**:
- 智能路由: ~10-50ms (路由决策)
- 防截断: ~0-100ms (取决于重试次数)
- 总开销: 通常 < 100ms

---

## 下一步优化方向

1. **智能负载均衡**: 基于响应时间动态调整路由权重
2. **故障转移**: 上游失败时自动切换到备用服务
3. **成本优化**: 根据模型价格智能选择上游
4. **A/B 测试**: 支持灰度发布新的路由策略
5. **指标收集**: 集成 Prometheus/Grafana 监控

---

## 文件清单

- `supabase-smart-router-optimized.ts` - Supabase 智能路由完整代码
- `cf-anti-truncate-optimized.js` - CF Workers 防截断核心逻辑
- `cf-worker-optimized-complete.js` - CF Workers 完整入口文件
- `OPTIMIZATION_GUIDE.md` - 本文档
