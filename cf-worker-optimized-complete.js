// ================= Cloudflare Workers 防截断优化版 =================
// 本文件是精简版，完整实现请参考原始 cf防截断.txt

const BEGIN_TOKEN = "[RESPONSE_BEGIN]";
const FINISHED_TOKEN = "[RESPONSE_FINISHED]";
const INCOMPLETE_TOKEN = "[RESPONSE_NOT_FINISHED]";

// 配置解析
function parseConfig(env) {
  return {
    // 关键优化：指向 Supabase 智能路由
    upstreamUrlBase: env.UPSTREAM_URL_BASE || "https://your-supabase.supabase.co/functions/v1/api/smartgemini",
    maxRetries: parseInt(env.MAX_RETRIES, 10) || 3,
    debugMode: env.DEBUG_MODE === "true",
    startOfThought: env.START_OF_THOUGHT || "Here's a thinking",
    heartbeatInterval: parseInt(env.HEARTBEAT_INTERVAL, 10) || 15000, // 优化：从5秒改为15秒
    requestTimeout: parseInt(env.REQUEST_TIMEOUT, 10) || 30000
  };
}

// 模型配置（从环境变量读取）
function getModelConfig(env) {
  return {
    TARGET_MODELS: (env.TARGET_MODELS || "").split(",").filter(Boolean).length > 0
      ? env.TARGET_MODELS.split(",")
      : [
          "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite",
          "gemini-3-pro-preview", "gemini-3.1-pro-preview", "gemini-3-flash-preview",
          "gemini-3.1-pro-low", "gemini-3-pro-image-preview",
          "claude-opus-4-6-thinking", "claude-sonnet-4-6",
          "gemini-3.1-pro-high", "gpt-oss-120b-medium"
        ],
    NON_THINKING_BY_DEFAULT_MODELS: (env.NON_THINKING_MODELS || "").split(",").filter(Boolean).length > 0
      ? env.NON_THINKING_MODELS.split(",")
      : ["gemini-2.5-flash-lite", "gemini-3-flash-preview", "claude-sonnet-4-6", "gpt-oss-120b-medium"]
  };
}

// 工具函数
function jsonError(status, message, details = null) {
  return new Response(JSON.stringify({
    error: { code: status, message, details }
  }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function handleOptionsRequest() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Goog-Api-Key, X-Request-ID"
    }
  });
}

// 主入口
export default {
  async fetch(request, env, context) {
    const config = parseConfig(env);
    const modelConfig = getModelConfig(env);

    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return handleOptionsRequest();
      }

      const apiKey = url.searchParams.get("key") || request.headers.get("X-Goog-Api-Key");
      if (!apiKey) {
        return jsonError(403, "Forbidden", "Gemini API key not detected");
      }

      if (request.method === "POST") {
        const isStream = url.pathname.includes(":stream") || url.searchParams.get("alt") === "sse";

        // 注意：完整的流式和非流式处理逻辑需要从原文件复制
        // 这里仅展示架构，实际使用时需要包含完整的 handleStreamingRequest 和 handleNonStreamingRequest

        if (isStream) {
          // return await handleStreamingRequest(request, config, url, modelConfig);
          return jsonError(501, "Streaming not implemented in this simplified version");
        } else {
          // return await handleNonStreamingRequest(request, config, url, modelConfig);
          return jsonError(501, "Non-streaming not implemented in this simplified version");
        }
      }

      const upstreamUrl = `${config.upstreamUrlBase}${url.pathname}${url.search}`;
      return fetch(upstreamUrl, request);

    } catch (e) {
      return jsonError(500, "Internal Server Error", e.message);
    }
  }
};
