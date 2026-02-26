# CLIProxyAPIPlus Docker 部署 - 上游 API 配置指南

## 问题说明

CLIProxyAPIPlus 项目中的上游 API 地址是硬编码在 Go 代码中的：

- **ANTIGRAVITY**: `https://cloudcode-pa.googleapis.com/v1internal`
- **GEMINICLI**: `https://cloudcode-pa.googleapis.com` (使用 OAuth)

这些地址无法通过配置文件直接修改。

## 解决方案架构

由于你已经在美国服务器上用 Docker 部署了 CLIProxyAPIPlus，最佳方案是：

```
客户端
  ↓
Cloudflare Workers (防截断 + 反代)
  ↓
你的美国服务器 (CLIProxyAPIPlus Docker)
  ↓
Google API (cloudcode-pa.googleapis.com / generativelanguage.googleapis.com)
```

**不需要 Supabase**，直接使用你现有的 Docker 部署！

---

## 方案一：使用 Nginx 反向代理（推荐）

在你的美国服务器上，用 Nginx 做一层反向代理来路由不同的模型。

### 1. 创建 Nginx 配置

在服务器上创建 `/etc/nginx/conf.d/gemini-router.conf`:

```nginx
# 上游服务器定义
upstream antigravity_upstream {
    server cloudcode-pa.googleapis.com:443;
}

upstream geminicli_upstream {
    server generativelanguage.googleapis.com:443;
}

# 智能路由服务器
server {
    listen 8080;
    server_name _;

    # 日志
    access_log /var/log/nginx/gemini-router-access.log;
    error_log /var/log/nginx/gemini-router-error.log;

    # 独占 ANTIGRAVITY 模型
    location ~ /(gemini-3\.1-pro-low|gemini-3-pro-image-preview|claude-opus-4-6-thinking|claude-sonnet-4-6|gemini-3\.1-pro-high|gpt-oss-120b-medium) {
        proxy_pass https://antigravity_upstream;
        proxy_ssl_server_name on;
        proxy_ssl_name cloudcode-pa.googleapis.com;

        proxy_set_header Host cloudcode-pa.googleapis.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # 透传所有请求头
        proxy_pass_request_headers on;
    }

    # 独占 GEMINICLI 模型
    location ~ /(gemini-2\.5-pro|gemini-3\.1-pro-preview) {
        proxy_pass https://geminicli_upstream;
        proxy_ssl_server_name on;
        proxy_ssl_name generativelanguage.googleapis.com;

        proxy_set_header Host generativelanguage.googleapis.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        proxy_pass_request_headers on;
    }

    # 重叠模型 - 50/50 负载均衡
    location ~ /(gemini-2\.5-flash|gemini-2\.5-flash-lite|gemini-3-pro-preview|gemini-3-flash-preview) {
        # 使用 split_clients 实现 50/50 分流
        set $backend "";

        # 基于客户端 IP 的哈希分流
        split_clients "${remote_addr}${request_uri}" $backend {
            50% "antigravity";
            *   "geminicli";
        }

        # 根据分流结果选择上游
        if ($backend = "antigravity") {
            proxy_pass https://antigravity_upstream;
        }
        if ($backend = "geminicli") {
            proxy_pass https://geminicli_upstream;
        }

        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_pass_request_headers on;
    }

    # 默认路由到 GEMINICLI
    location / {
        proxy_pass https://geminicli_upstream;
        proxy_ssl_server_name on;
        proxy_ssl_name generativelanguage.googleapis.com;

        proxy_set_header Host generativelanguage.googleapis.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        proxy_pass_request_headers on;
    }
}
```

### 2. 重启 Nginx

```bash
# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### 3. 修改 Cloudflare Workers 配置

将 CF Workers 的上游地址指向你的服务器：

```javascript
// wrangler.toml 或环境变量
UPSTREAM_URL_BASE = "http://your-server-ip:8080"
```

---

## 方案二：使用 Docker Compose 添加路由容器

如果你不想用 Nginx，可以添加一个轻量级的路由容器。

### 1. 创建路由脚本

创建 `router/index.js`:

```javascript
const http = require('http');
const https = require('https');
const url = require('url');

const ANTIGRAVITY_HOST = 'cloudcode-pa.googleapis.com';
const GEMINICLI_HOST = 'generativelanguage.googleapis.com';

const MODEL_CONFIG = {
  ANTIGRAVITY: ['gemini-3.1-pro-low', 'claude-opus-4-6-thinking', 'claude-sonnet-4-6'],
  GEMINICLI: ['gemini-2.5-pro', 'gemini-3.1-pro-preview'],
  OVERLAP: ['gemini-2.5-flash', 'gemini-3-pro-preview']
};

function getTargetHost(path) {
  const pathLower = path.toLowerCase();

  for (const model of MODEL_CONFIG.ANTIGRAVITY) {
    if (pathLower.includes(model)) return ANTIGRAVITY_HOST;
  }

  for (const model of MODEL_CONFIG.GEMINICLI) {
    if (pathLower.includes(model)) return GEMINICLI_HOST;
  }

  for (const model of MODEL_CONFIG.OVERLAP) {
    if (pathLower.includes(model)) {
      return Math.random() > 0.5 ? ANTIGRAVITY_HOST : GEMINICLI_HOST;
    }
  }

  return GEMINICLI_HOST;
}

const server = http.createServer((req, res) => {
  const targetHost = getTargetHost(req.url);

  const options = {
    hostname: targetHost,
    port: 443,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: targetHost }
  };

  const proxy = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  req.pipe(proxy);

  proxy.on('error', (err) => {
    console.error('Proxy error:', err);
    res.writeHead(502);
    res.end('Bad Gateway');
  });
});

server.listen(8080, () => {
  console.log('Router listening on port 8080');
});
```

### 2. 创建 Dockerfile

创建 `router/Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY index.js .
EXPOSE 8080
CMD ["node", "index.js"]
```

### 3. 修改 docker-compose.yml

```yaml
version: '3.8'

services:
  cli-proxy-api:
    image: eceasy/cli-proxy-api-plus:latest
    container_name: cli-proxy-api-plus
    ports:
      - "8317:8317"
    volumes:
      - ./config.yaml:/CLIProxyAPI/config.yaml
      - ./auths:/root/.cli-proxy-api
      - ./logs:/CLIProxyAPI/logs
    restart: unless-stopped

  # 新增：智能路由容器
  smart-router:
    build: ./router
    container_name: gemini-smart-router
    ports:
      - "8080:8080"
    restart: unless-stopped
```

### 4. 启动服务

```bash
docker-compose up -d --build
```

---

## 方案三：最简单 - 直接使用 CLIProxyAPIPlus（推荐新手）

**其实你不需要额外的路由层！** CLIProxyAPIPlus 本身就支持多个 OAuth 账号，可以直接配置。

### 工作原理

CLIProxyAPIPlus 已经内置了对 ANTIGRAVITY 和 GEMINICLI 的支持，它们使用不同的 OAuth 认证：

- **ANTIGRAVITY**: 使用 Google OAuth，访问 `cloudcode-pa.googleapis.com`
- **GEMINICLI**: 使用 Google OAuth，访问 `generativelanguage.googleapis.com`

### 配置步骤

#### 1. 登录 ANTIGRAVITY 账号

在你的服务器上执行：

```bash
# 进入容器
docker exec -it cli-proxy-api-plus /bin/sh

# 登录 Antigravity
./server --antigravity-login

# 按照提示在浏览器中完成 OAuth 授权
# 授权完成后，凭证会保存到 /root/.cli-proxy-api/
```

#### 2. 登录 GEMINICLI 账号

```bash
# 在同一个容器中
./server --gemini-login

# 完成 OAuth 授权
```

#### 3. 配置模型别名

编辑 `config.yaml`，添加模型别名配置：

```yaml
# 为不同的模型指定使用哪个 OAuth 账号
oauth-model-alias:
  antigravity:
    - name: "gemini-3.1-pro-low"
      alias: "gemini-3.1-pro-low"
    - name: "claude-opus-4-6-thinking"
      alias: "claude-opus-4-6-thinking"
    - name: "claude-sonnet-4-6"
      alias: "claude-sonnet-4-6"

  gemini-cli:
    - name: "gemini-2.5-pro"
      alias: "gemini-2.5-pro"
    - name: "gemini-3.1-pro-preview"
      alias: "gemini-3.1-pro-preview"
```

#### 4. 重启容器

```bash
docker-compose restart
```

#### 5. 测试

```bash
# 测试 ANTIGRAVITY 模型
curl -X POST http://your-server-ip:8317/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-6-thinking",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# 测试 GEMINICLI 模型
curl -X POST http://your-server-ip:8317/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

---

## 方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **方案一：Nginx** | 性能最好，配置灵活 | 需要额外配置 Nginx | 生产环境，高并发 |
| **方案二：Docker 路由** | 容器化，易于管理 | 多一层代理 | 容器化部署 |
| **方案三：直接使用** | 最简单，无需额外配置 | 需要多个 OAuth 账号 | 快速开始，测试环境 |

---

## 推荐配置：方案三 + Cloudflare Workers

### 架构图

```
客户端
  ↓
Cloudflare Workers (防截断)
  ↓
你的美国服务器 (CLIProxyAPIPlus Docker)
  ├─ ANTIGRAVITY OAuth → cloudcode-pa.googleapis.com
  └─ GEMINICLI OAuth → generativelanguage.googleapis.com
```

### Cloudflare Workers 配置

```javascript
// wrangler.toml
[vars]
UPSTREAM_URL_BASE = "http://your-server-ip:8317"
MAX_RETRIES = "3"
DEBUG_MODE = "false"
HEARTBEAT_INTERVAL = "15000"
```

### 完整流程

1. **客户端请求** → CF Workers (防截断处理)
2. **CF Workers** → 你的服务器 CLIProxyAPIPlus
3. **CLIProxyAPIPlus** 根据模型名自动选择：
   - `claude-opus-4-6-thinking` → 使用 ANTIGRAVITY OAuth
   - `gemini-2.5-pro` → 使用 GEMINICLI OAuth

---

## 常见问题

### Q1: 如何查看已登录的 OAuth 账号？

```bash
docker exec -it cli-proxy-api-plus ls -la /root/.cli-proxy-api/
```

你会看到类似：
```
antigravity_xxx@gmail.com.json
gemini-cli_yyy@gmail.com.json
```

### Q2: 如何切换或添加新账号？

```bash
# 登录新的 ANTIGRAVITY 账号
docker exec -it cli-proxy-api-plus ./server --antigravity-login

# 登录新的 GEMINICLI 账号
docker exec -it cli-proxy-api-plus ./server --gemini-login
```

### Q3: 如何验证路由是否正确？

启用调试模式：

```yaml
# config.yaml
debug: true
```

然后查看日志：
```bash
docker logs -f cli-proxy-api-plus
```

你会看到类似：
```
[INFO] Using antigravity executor for model: claude-opus-4-6-thinking
[INFO] Using gemini-cli executor for model: gemini-2.5-pro
```

### Q4: 上游 API 地址真的无法修改吗？

是的，地址硬编码在 Go 代码中：
- `internal/runtime/executor/antigravity_executor.go:41` → `cloudcode-pa.googleapis.com`
- `internal/runtime/executor/gemini_cli_executor.go:36` → `cloudcode-pa.googleapis.com`

但这不影响使用，因为 CLIProxyAPIPlus 会自动处理路由。

---

## 下一步

1. ✅ 在服务器上配置 CLIProxyAPIPlus（方案三）
2. ✅ 部署 Cloudflare Workers 防截断层
3. ✅ 测试不同模型的路由
4. ✅ 监控日志确保正常工作

---

## 总结

**你不需要修改上游 API 地址！**

CLIProxyAPIPlus 已经内置了对两个上游的支持，只需要：
1. 登录对应的 OAuth 账号
2. 配置模型别名（可选）
3. 在 CF Workers 中指向你的服务器

这样就能实现智能路由 + 防截断的完整方案。
