import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ================= 配置区 =================
// 从环境变量读取配置，支持运行时动态配置
const CONFIG = {
  ANTIGRAVITY_HOST: Deno.env.get("ANTIGRAVITY_HOST") || "api.antigravity.xxx",
  GEMINICLI_HOST: Deno.env.get("GEMINICLI_HOST") || "api.geminicli.xxx",
  DEBUG_MODE: Deno.env.get("DEBUG_MODE") === "true",
  ENABLE_METRICS: Deno.env.get("ENABLE_METRICS") === "true",
  REQUEST_TIMEOUT: parseInt(Deno.env.get("REQUEST_TIMEOUT") || "30000"),
};

// 原始的 API 代理映射表
const proxies = {
  discord: "discord.com/api",
  telegram: "api.telegram.org",
  httpbin: "httpbin.org",
  openai: "api.openai.com",
  claude: "api.anthropic.com",
  gemini: "generativelanguage.googleapis.com",
  gemininothink: "generativelanguage.googleapis.com",
  meta: "www.meta.ai/api",
  groq: "api.groq.com/openai",
  xai: "api.x.ai",
  cohere: "api.cohere.ai",
  huggingface: "api-inference.huggingface.co",
  together: "api.together.xyz",
  novita: "api.novita.ai",
  portkey: "api.portkey.ai",
  fireworks: "api.fireworks.ai",
  targon: "api.targon.com",
  openrouter: "openrouter.ai/api",
  siliconflow: "api.siliconflow.cn",
  modelscope: "api-inference.modelscope.cn",
  gmi: "api.gmi-serving.com",
  azureinference: "models.inference.ai.azure.com",
  githubai: "models.github.ai/inference",
  dmxcom: "www.dmxapi.com",
  dmxcn: "www.dmxapi.cn",
  smartgemini: "dynamic_routing" // 智能路由专用通道
};

// 模型分类配置（统一管理）
const MODEL_CONFIG = {
  EXCLUSIVE_ANTIGRAVITY: [
    "gemini-3.1-pro-low",
    "gemini-3-pro-image-preview",
    "claude-opus-4-6-thinking",
    "claude-sonnet-4-6",
    "gemini-3.1-pro-high",
    "gpt-oss-120b-medium"
  ],
  EXCLUSIVE_GEMINI_CLI: [
    "gemini-2.5-pro",
    "gemini-3.1-pro-preview"
  ],
  OVERLAP_MODELS: [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3-pro-preview",
    "gemini-3-flash-preview"
  ]
};

// ================= 辅助函数区 =================
const BlacklistedHeaders = new Set([
  "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor",
  "cf-worker", "cdn-loop", "cf-ew-via", "baggage", "sb-request-id",
  "x-amzn-trace-id", "x-forwarded-for", "x-forwarded-host",
  "x-forwarded-proto", "x-forwarded-server", "x-real-ip",
  "x-original-host", "forwarded", "via", "referer",
  "x-request-id", "x-correlation-id", "x-trace-id"
]);

// 生成请求追踪 ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 增强的日志函数
function logRequest(
  method: string,
  pathname: string,
  targetUrl?: string,
  status?: number,
  requestId?: string,
  duration?: number
) {
  const timestamp = new Date().toISOString();
  const statusInfo = status ? ` [${status}]` : '';
  const target = targetUrl ? ` -> ${targetUrl}` : '';
  const reqId = requestId ? ` [${requestId}]` : '';
  const time = duration ? ` (${duration}ms)` : '';

  console.log(`[${timestamp}]${reqId} ${method} ${pathname}${target}${statusInfo}${time}`);

  // 调试模式下输出更多信息
  if (CONFIG.DEBUG_MODE && targetUrl) {
    console.log(`  └─ Target: ${targetUrl}`);
  }
}

// 错误分类
function categorizeError(error: Error) {
  const errorMessage = error.message.toLowerCase();

  if (error.name === 'AbortError' || errorMessage.includes('timeout')) {
    return { type: 'TIMEOUT', message: 'Request timeout', status: 504 };
  }
  if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
    return { type: 'NETWORK', message: 'Network error', status: 502 };
  }
  if (errorMessage.includes('dns') || errorMessage.includes('name resolution')) {
    return { type: 'DNS', message: 'DNS resolution failed', status: 502 };
  }
  if (errorMessage.includes('connection refused') || errorMessage.includes('connect')) {
    return { type: 'CONNECTION', message: 'Connection refused', status: 503 };
  }
  if (errorMessage.includes('ssl') || errorMessage.includes('tls') || errorMessage.includes('certificate')) {
    return { type: 'SSL', message: 'SSL/TLS error', status: 502 };
  }

  return { type: 'UNKNOWN', message: `Unexpected error: ${error.message}`, status: 500 };
}

// 创建错误响应
function createErrorResponse(message: string, status: number, details?: any, requestId?: string) {
  const errorBody = JSON.stringify({
    error: message,
    status,
    timestamp: new Date().toISOString(),
    requestId,
    ...(details && { details })
  });

  return new Response(errorBody, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "X-Request-ID": requestId || generateRequestId()
    }
  });
}

// ================= 核心路由逻辑 =================
interface RouteDecision {
  host: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * 优化后的动态路由解析函数
 * 支持从 URL 路径和请求体中提取模型信息
 */
function getDynamicTargetHost(pathname: string, requestBody?: any): RouteDecision {
  const pathLower = pathname.toLowerCase();
  let modelName = "";

  // 尝试从请求体提取模型名称（支持 OpenAI 格式）
  if (requestBody) {
    try {
      const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
      modelName = (body.model || "").toLowerCase();
    } catch (e) {
      if (CONFIG.DEBUG_MODE) {
        console.log("  └─ Failed to parse request body for model extraction:", e);
      }
    }
  }

  // 合并搜索文本
  const searchText = `${pathLower} ${modelName}`.toLowerCase();

  // 1. 检查独占 Antigravity 模型
  for (const model of MODEL_CONFIG.EXCLUSIVE_ANTIGRAVITY) {
    if (searchText.includes(model.toLowerCase())) {
      return {
        host: CONFIG.ANTIGRAVITY_HOST,
        reason: `Exclusive model: ${model}`,
        confidence: 'high'
      };
    }
  }

  // 2. 检查独占 Gemini CLI 模型
  for (const model of MODEL_CONFIG.EXCLUSIVE_GEMINI_CLI) {
    if (searchText.includes(model.toLowerCase())) {
      return {
        host: CONFIG.GEMINICLI_HOST,
        reason: `Exclusive model: ${model}`,
        confidence: 'high'
      };
    }
  }

  // 3. 检查重叠模型 -> 50/50 轮询负载均衡
  for (const model of MODEL_CONFIG.OVERLAP_MODELS) {
    if (searchText.includes(model.toLowerCase())) {
      const useAntigravity = Math.random() >= 0.5;
      return {
        host: useAntigravity ? CONFIG.ANTIGRAVITY_HOST : CONFIG.GEMINICLI_HOST,
        reason: `Load balancing for overlap model: ${model}`,
        confidence: 'medium'
      };
    }
  }

  // 4. 默认回退到 Gemini CLI
  return {
    host: CONFIG.GEMINICLI_HOST,
    reason: 'Default fallback (no model match)',
    confidence: 'low'
  };
}

// ================= 请求处理函数 =================
async function handleRequest(req: Request): Promise<Response> {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const url = new URL(req.url);
  const { pathname, search } = url;

  logRequest(req.method, pathname, undefined, undefined, requestId);

  // 处理 CORS 预检请求
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, anthropic-version, x-api-key, X-Goog-Api-Key, X-Request-ID"
      }
    });
  }

  // 解析路径
  const pathParts = pathname.split("/");
  if (pathParts.length < 3) {
    return createErrorResponse(
      "Invalid path format. Expected format: /api/{service}/{path}",
      400,
      { availableServices: Object.keys(proxies) },
      requestId
    );
  }

  const targetAlias = pathParts[2].toLowerCase();
  let targetHost = proxies[targetAlias];
  let targetPath = pathParts.slice(3).join("/");

  if (!targetHost) {
    console.error(`[${requestId}] Service mapping not found: '${targetAlias}'`);
    return createErrorResponse(
      `Service alias '${targetAlias}' not found`,
      404,
      { availableServices: Object.keys(proxies) },
      requestId
    );
  }

  // ============== 智能路由特殊处理 ==============
  let routeDecision: RouteDecision | null = null;
  let requestBody: any = null;

  if (targetAlias === "smartgemini") {
    // 对于 POST 请求，读取 body 以提取模型信息
    if (req.method === "POST" && req.headers.get("content-type")?.includes("application/json")) {
      try {
        const bodyText = await req.text();
        requestBody = bodyText;
        routeDecision = getDynamicTargetHost(pathname, bodyText);
        targetHost = routeDecision.host;

        if (CONFIG.DEBUG_MODE) {
          console.log(`[${requestId}] Smart Router Decision:`, routeDecision);
        }
      } catch (e) {
        console.error(`[${requestId}] Failed to read request body:`, e);
        return createErrorResponse(
          "Failed to parse request body",
          400,
          { error: e.message },
          requestId
        );
      }
    } else {
      // 非 POST 或非 JSON 请求，仅从路径判断
      routeDecision = getDynamicTargetHost(pathname);
      targetHost = routeDecision.host;
    }

    console.log(`[${requestId}] [Smart Router] ${routeDecision.reason} -> ${targetHost}`);
  }

  const targetUrl = `https://${targetHost}/${targetPath}${search}`;

  if (CONFIG.DEBUG_MODE) {
    console.log(`[${requestId}] Final target URL: ${targetUrl}`);
  }

  try {
    // 构建转发请求头
    const forwardedHeaders = new Headers();

    for (const [key, value] of req.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (!BlacklistedHeaders.has(lowerKey) && !lowerKey.startsWith("sec-ch-ua")) {
        forwardedHeaders.set(key, value);
      }
    }

    forwardedHeaders.set("Host", targetHost);
    forwardedHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    forwardedHeaders.set("X-Request-ID", requestId);

    // Claude API 特殊处理
    if (targetAlias === "claude" && !forwardedHeaders.has("anthropic-version")) {
      forwardedHeaders.set("anthropic-version", "2023-06-01");
    }

    // 处理请求体
    let finalRequestBody: BodyInit | null = null;

    if (req.method !== "GET" && req.method !== "HEAD") {
      // gemininothink 特殊处理：禁用思考过程
      if (targetAlias === "gemininothink" && req.method === "POST" &&
          req.headers.get("content-type")?.includes("application/json")) {
        try {
          const bodyText = requestBody || await req.text();
          const bodyJson = JSON.parse(bodyText);

          bodyJson.generationConfig = {
            ...bodyJson.generationConfig || {},
            thinkingConfig: { thinkingBudget: 0 }
          };

          finalRequestBody = JSON.stringify(bodyJson);
          forwardedHeaders.set("content-type", "application/json");
        } catch (e) {
          return createErrorResponse(
            "Invalid JSON format in request body",
            400,
            { error: e.message },
            requestId
          );
        }
      } else if (requestBody) {
        // 使用已读取的 body（smartgemini 场景）
        finalRequestBody = requestBody;
      } else {
        // 其他情况，直接传递原始 body
        finalRequestBody = req.body;
      }
    }

    // 发起上游请求（带超时控制）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

    const apiResponse = await fetch(targetUrl, {
      method: req.method,
      headers: forwardedHeaders,
      body: finalRequestBody,
      redirect: "manual",
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const duration = Date.now() - startTime;
    logRequest(req.method, pathname, targetUrl, apiResponse.status, requestId, duration);

    // 构建响应头
    const responseHeaders = new Headers(apiResponse.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH");
    responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, anthropic-version, x-api-key, X-Goog-Api-Key");
    responseHeaders.set("X-Request-ID", requestId);
    responseHeaders.set("X-Response-Time", `${duration}ms`);

    if (routeDecision) {
      responseHeaders.set("X-Route-Decision", routeDecision.reason);
      responseHeaders.set("X-Route-Confidence", routeDecision.confidence);
    }

    return new Response(apiResponse.body, {
      status: apiResponse.status,
      headers: responseHeaders
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorInfo = categorizeError(error as Error);

    console.error(`[${requestId}] Request failed after ${duration}ms:`, error);
    logRequest(req.method, pathname, targetUrl, errorInfo.status, requestId, duration);

    return createErrorResponse(
      errorInfo.message,
      errorInfo.status,
      {
        errorType: errorInfo.type,
        originalError: error.message,
        targetUrl
      },
      requestId
    );
  }
}

// ================= 启动服务 =================
serve(handleRequest, { port: 8000 });

console.log("🚀 多模型智能 API 代理服务器已启动");
console.log("📋 配置信息:");
console.log(`  - ANTIGRAVITY_HOST: ${CONFIG.ANTIGRAVITY_HOST}`);
console.log(`  - GEMINICLI_HOST: ${CONFIG.GEMINICLI_HOST}`);
console.log(`  - DEBUG_MODE: ${CONFIG.DEBUG_MODE}`);
console.log(`  - REQUEST_TIMEOUT: ${CONFIG.REQUEST_TIMEOUT}ms`);
console.log(`  - 支持的服务: ${Object.keys(proxies).length} 个`);
