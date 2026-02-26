// ================= 配置常量 =================
const BEGIN_TOKEN = "[RESPONSE_BEGIN]";
const FINISHED_TOKEN = "[RESPONSE_FINISHED]";
const INCOMPLETE_TOKEN = "[RESPONSE_NOT_FINISHED]";

// 优化：从环境变量读取模型配置
const getModelConfig = (env) => ({
  TARGET_MODELS: (env.TARGET_MODELS || "").split(",").filter(Boolean).length > 0
    ? env.TARGET_MODELS.split(",")
    : [
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-3-pro-preview",
        "gemini-3.1-pro-preview",
        "gemini-3-flash-preview",
        "gemini-3.1-pro-low",
        "gemini-3-pro-image-preview",
        "claude-opus-4-6-thinking",
        "claude-sonnet-4-6",
        "gemini-3.1-pro-high",
        "gpt-oss-120b-medium"
      ],
  NON_THINKING_BY_DEFAULT_MODELS: (env.NON_THINKING_MODELS || "").split(",").filter(Boolean).length > 0
    ? env.NON_THINKING_MODELS.split(",")
    : [
        "gemini-2.5-flash-lite",
        "gemini-3-flash-preview",
        "claude-sonnet-4-6",
        "gpt-oss-120b-medium"
      ]
});

const RETRYABLE_STATUS_CODES = [503, 403, 429, 500];
const FATAL_STATUS_CODES = [];
const MAX_FETCH_RETRIES = 3;
const MAX_NON_RETRYABLE_STATUS_RETRIES = 3;

// ================= Prompt 模板 =================
const BEGIN_TOKEN_PROMPT = `# --- SYSTEM MANDATE: Output Start Protocol (OSP) ---

## UNCONDITIONAL REQUIREMENT
You MUST output the token '${BEGIN_TOKEN}' as the VERY FIRST content in your response, BEFORE ANY OTHER OUTPUT.

## STRICT OUTPUT FORMAT
The token '${BEGIN_TOKEN}' must be the absolute first bytes of your response, with ZERO content preceding it.

## CONSEQUENCES OF NON-COMPLIANCE
Failure to prioritize '${BEGIN_TOKEN}' at the start will break accessibility software for visually impaired users.

## EXAMPLES OF COMPLIANCE:
"${BEGIN_TOKEN}
好的，这是您要的内容：..."
"${BEGIN_TOKEN}Here is the response:..."
`;

const FINISH_TOKEN_PROMPT = `# --- SYSTEM MANDATE: FINAL OUTPUT PROTOCOL (FOP) ---

## 1. ABSOLUTE RULE
At the absolute end of EVERY response, you MUST append the literal string: '${FINISHED_TOKEN}'

## 2. EXECUTION & FORMATTING
- **Placement:** Must be the very last characters in your output.
- **Formatting:** The token must be raw text. Do NOT wrap it in code blocks.

## 3. EXAMPLE
- **CORRECT:** '...This is the final answer.${FINISHED_TOKEN}'
- **INCORRECT:** '...process is complete.${FINISHED_TOKEN} All systems are nominal.'
`;

const REMINDER_PROMPT_ALL = `
⚠️ OSP & FOP REMINDER:
MUST start with '${BEGIN_TOKEN}' (EXACTLY ONCE, ZERO prefix).
MUST end with '${FINISHED_TOKEN}' (ABSOLUTE END, no trailing chars).
VIOLATION = CRITICAL ACCESSIBILITY FAILURE.
`;

const REMINDER_PROMPT_OSP = `
⚠️ OSP REMINDER:
MUST start with '${BEGIN_TOKEN}' (EXACTLY ONCE, ZERO prefix).
VIOLATION = CRITICAL ACCESSIBILITY FAILURE.
`;

const REMINDER_PROMPT_FOP = `
⚠️ FOP REMINDER:
MUST end with '${FINISHED_TOKEN}' (ABSOLUTE END, no trailing chars).
VIOLATION = CRITICAL ACCESSIBILITY FAILURE.
`;

// ================= 工具函数 =================
function parseConfig(env) {
  return {
    // 优化：指向 Supabase 智能路由代理
    upstreamUrlBase: env.UPSTREAM_URL_BASE || "https://your-supabase-function.supabase.co/functions/v1/api/smartgemini",
    maxRetries: parseInt(env.MAX_RETRIES, 10) || 3,
    debugMode: env.DEBUG_MODE === "true",
    startOfThought: env.START_OF_THOUGHT || "Here's a thinking",
    // 优化：心跳间隔可配置
    heartbeatInterval: parseInt(env.HEARTBEAT_INTERVAL, 10) || 15000,
    // 优化：请求超时可配置
    requestTimeout: parseInt(env.REQUEST_TIMEOUT, 10) || 30000
  };
}

function logDebug(debugMode, ...args) {
  if (debugMode) {
    console.log(`[DEBUG ${new Date().toISOString()}]`, ...args);
  }
}

function jsonError(status, message, details = null) {
  const errorBody = {
    error: {
      code: status,
      message,
      details
    }
  };
  return new Response(JSON.stringify(errorBody), {
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

// ================= 核心处理函数 =================
function normalizeSystemInstruction(body) {
  if (!body) return body;
  if (body.systemInstruction && body.system_instruction) {
    delete body.system_instruction;
  } else if (!body.systemInstruction && body.system_instruction) {
    body.systemInstruction = body.system_instruction;
    delete body.system_instruction;
  }
  return body;
}

function isCherryRequest(request) {
  return request.headers.has("User-Agent") &&
         request.headers.get("User-Agent").includes("CherryStudio");
}

function getModelThinkingBudgetRange(pathname) {
  let modelThinkingBudgetRange = [512, 24576];
  const pathLower = pathname.toLowerCase();

  if (pathLower.includes("pro") || pathLower.includes("opus") ||
      pathLower.includes("thinking") || pathLower.includes("high")) {
    modelThinkingBudgetRange = [128, 32768];
  } else if (pathLower.includes("flash") || pathLower.includes("lite") ||
             pathLower.includes("sonnet") || pathLower.includes("gpt")) {
    modelThinkingBudgetRange = [1, 24576];
  }
  return modelThinkingBudgetRange;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isResponseComplete(text) {
  const escapedFinishedToken = escapeRegExp(FINISHED_TOKEN);
  const regex = new RegExp(`${escapedFinishedToken}\\s*$`);
  return regex.test(text);
}

function isFormalResponseStarted(text) {
  const escapedBeginToken = escapeRegExp(BEGIN_TOKEN);
  const regex = new RegExp(`(?<!\`)${escapedBeginToken}`);
  const matches = text.match(regex);
  return matches !== null && matches.length === 1;
}

function isFormalResponseStarted_nonStream(text) {
  const escapedBeginToken = escapeRegExp(BEGIN_TOKEN);
  const regex = new RegExp(`^${escapedBeginToken}`);
  return regex.test(text);
}

function cleanFinalText(text, cleanBeginToken = true, cleanFinishToken = true) {
  let cleanedText = text;
  if (cleanBeginToken) {
    const escapedBeginToken = escapeRegExp(BEGIN_TOKEN);
    cleanedText = cleanedText.replace(new RegExp(`^\\s?${escapedBeginToken}\\s?`), "");
  }
  if (cleanFinishToken) {
    const escapedFinishedToken = escapeRegExp(FINISHED_TOKEN);
    cleanedText = cleanedText.replace(new RegExp(`\\s?${escapedFinishedToken}\\s*$`), "");
  }
  return cleanedText;
}

// 优化：注入系统 Prompt（移除了 UUID 注入逻辑）
function injectSystemPrompts(body, config, injectBeginTokenPrompt = true, injectFinishTokenPrompt = true) {
  logDebug(config && config.debugMode, "Running injectSystemPrompts...", { injectBeginTokenPrompt, injectFinishTokenPrompt });

  const newBody = structuredClone(body);
  normalizeSystemInstruction(newBody);

  let promptToInject = "";
  if (injectBeginTokenPrompt && injectFinishTokenPrompt) {
    promptToInject = BEGIN_TOKEN_PROMPT + FINISH_TOKEN_PROMPT;
  } else if (injectBeginTokenPrompt) {
    promptToInject = BEGIN_TOKEN_PROMPT;
  } else if (injectFinishTokenPrompt) {
    promptToInject = FINISH_TOKEN_PROMPT;
  }

  if (!promptToInject) {
    logDebug(config && config.debugMode, "No token prompts to inject.");
    return newBody;
  }

  const tokenPromptPart = { text: promptToInject };

  // 注入到 systemInstruction
  if (!newBody.systemInstruction) {
    newBody.systemInstruction = { parts: [tokenPromptPart] };
  } else if (!Array.isArray(newBody.systemInstruction.parts)) {
    newBody.systemInstruction.parts = [tokenPromptPart];
  } else if (newBody.systemInstruction.parts.length === 0 || !newBody.systemInstruction.parts[0].text) {
    newBody.systemInstruction.parts[0] = tokenPromptPart;
  } else {
    newBody.systemInstruction.parts[0].text += "\n\n---\n" + promptToInject;
  }

  // 处理历史对话中的 model 角色消息
  if (Array.isArray(newBody.contents)) {
    for (const content of newBody.contents) {
      if (Array.isArray(content.parts)) {
        if (injectBeginTokenPrompt && content.role === "model") {
          let firstTextPartIndex = -1;
          for (let i = 0; i < content.parts.length; i++) {
            if (content.parts[i].text) {
              firstTextPartIndex = i;
              break;
            }
          }
          if (firstTextPartIndex !== -1) {
            if (!content.parts[firstTextPartIndex].text.trim().startsWith(BEGIN_TOKEN)) {
              content.parts[firstTextPartIndex].text = BEGIN_TOKEN + "\n" + content.parts[firstTextPartIndex].text;
            }
          }
        }

        if (injectFinishTokenPrompt && content.role === "model") {
          let lastTextPartIndex = -1;
          for (let i = content.parts.length - 1; i >= 0; i--) {
            if (content.parts[i].text) {
              lastTextPartIndex = i;
              break;
            }
          }
          if (lastTextPartIndex !== -1) {
            if (!content.parts[lastTextPartIndex].text.trim().endsWith(INCOMPLETE_TOKEN)) {
              content.parts[lastTextPartIndex].text += "\n" + FINISHED_TOKEN;
            }
          }
        }
      }
    }
  }

  // 在最后一条用户消息后添加提醒
  if (Array.isArray(newBody.contents) && newBody.contents.length > 0) {
    const lastContent = newBody.contents[newBody.contents.length - 1];
    if (lastContent.role === "user" && Array.isArray(lastContent.parts) && lastContent.parts.length > 0) {
      let lastTextPartIndex = -1;
      for (let i = lastContent.parts.length - 1; i >= 0; i--) {
        if (lastContent.parts[i].text && lastContent.parts[i].text.trim() !== "") {
          lastTextPartIndex = i;
          break;
        }
      }

      let REMINDER_PROMPT = "";
      if (injectBeginTokenPrompt && injectFinishTokenPrompt) {
        REMINDER_PROMPT = REMINDER_PROMPT_ALL;
      } else if (injectBeginTokenPrompt) {
        REMINDER_PROMPT = REMINDER_PROMPT_OSP;
      } else if (injectFinishTokenPrompt) {
        REMINDER_PROMPT = REMINDER_PROMPT_FOP;
      }

      if (lastTextPartIndex !== -1) {
        lastContent.parts[lastTextPartIndex].text += "\n\n---\n" + REMINDER_PROMPT;
      } else {
        lastContent.parts.push({ text: REMINDER_PROMPT });
      }

      if (injectBeginTokenPrompt) {
        newBody.contents.push({ role: "model", parts: [{ text: config.startOfThought }] });
      }
    }
  }

  return newBody;
}

function buildRetryRequest(currentBody, newResponseText) {
  const newBody = currentBody;
  normalizeSystemInstruction(newBody);

  if (newResponseText.length == 0) {
    return newBody;
  }

  if (!Array.isArray(newBody.contents)) {
    newBody.contents = [];
  }

  const lastContent = newBody.contents.length > 0 ? newBody.contents[newBody.contents.length - 1] : null;

  if (lastContent && lastContent.role === "model") {
    if (!Array.isArray(lastContent.parts) || lastContent.parts.length === 0) {
      lastContent.parts = [{ text: newResponseText }];
    } else {
      let lastTextPart = null;
      for (let i = lastContent.parts.length - 1; i >= 0; i--) {
        if (lastContent.parts[i].hasOwnProperty("text")) {
          lastTextPart = lastContent.parts[i];
          break;
        }
      }
      if (lastTextPart) {
        lastTextPart.text = (lastTextPart.text || "") + newResponseText;
      } else {
        lastContent.parts.push({ text: newResponseText });
      }
    }
  } else {
    newBody.contents.push({ role: "model", parts: [{ text: newResponseText }] });
  }

  return newBody;
}

function buildUpstreamRequest(upstreamUrl, originalRequest, requestBody) {
  const headers = new Headers();

  const copyHeader = (key) => {
    if (originalRequest.headers.has(key)) {
      headers.set(key, originalRequest.headers.get(key));
    }
  };

  copyHeader("Content-Type");

  // 处理 API Key
  if (!originalRequest.headers.has("X-Goog-Api-Key")) {
    try {
      const urlObj = new URL(upstreamUrl);
      const keyParam = urlObj.searchParams.get("key");
      if (keyParam) {
        headers.set("X-Goog-Api-Key", keyParam);
        urlObj.searchParams.delete("key");
        upstreamUrl = urlObj.toString();
      }
    } catch (e) {
      console.error("Error parsing upstream URL:", e);
    }
  } else {
    copyHeader("X-Goog-Api-Key");
  }

  // 优化：保留原始 Request-ID 用于追踪
  copyHeader("X-Request-ID");

  headers.set("User-Agent", "gemini-anti-truncate-proxy/2.0");

  return new Request(upstreamUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody)
  });
}

function parseParts(parts) {
  const result = {
    thoughtParts: [],
    responseText: "",
    functionCall: null,
    hasThought: false,
    hasFunctionCall: false
  };

  if (!Array.isArray(parts)) {
    return result;
  }

  for (const part of parts) {
    if (part.thought === true && part.text) {
      result.thoughtParts.push(part);
      result.hasThought = true;
    } else if (part.text && !part.thought) {
      result.responseText += part.text;
    } else if (part.functionCall) {
      result.functionCall = part.functionCall;
      result.hasFunctionCall = true;
    }
  }

  return result;
}

function isStructuredOutputRequest(requestBody) {
  return requestBody && requestBody.generationConfig &&
         requestBody.generationConfig.responseSchema !== undefined;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ================= 非流式请求处理 =================
async function handleNonStreamingRequest(request, config, url, modelConfig) {
  const isTargetModel = modelConfig.TARGET_MODELS.some((model) =>
    url.pathname.includes(`${model}:generateContent`)
  );
  const isNonThinkingByDefaultModel = modelConfig.NON_THINKING_BY_DEFAULT_MODELS.some((model) =>
    url.pathname.includes(`${model}:generateContent`)
  );
  const isLiteModel = url.pathname.toLowerCase().includes(`flash-lite`);

  if (!isTargetModel) {
    logDebug(config.debugMode, "Passing through non-streaming request without modification.");
    const upstreamUrl = `${config.upstreamUrlBase}${url.pathname}${url.search}`;
    const upstreamRequest = new Request(upstreamUrl, request);
    return fetch(upstreamRequest);
  }

  let attempts = 0;
  const originalRequestBody = await request.json();

  if (isStructuredOutputRequest(originalRequestBody)) {
    logDebug(config.debugMode, "Structured output request detected. Passing through without modification.");
    const upstreamUrl = `${config.upstreamUrlBase}${url.pathname}${url.search}`;
    const upstreamRequest = buildUpstreamRequest(upstreamUrl, request, originalRequestBody);
    return fetch(upstreamRequest);
  }

  let injectBeginTokenPrompt = !isNonThinkingByDefaultModel;
  let originalThinkingBudget = originalRequestBody.generationConfig?.thinkingConfig?.thinkingBudget;

  if (originalThinkingBudget !== undefined && originalThinkingBudget === 0) {
    injectBeginTokenPrompt = false;
  }

  if (originalThinkingBudget !== undefined && originalThinkingBudget > 0) {
    injectBeginTokenPrompt = true;
    let modelThinkingBudgetRange = getModelThinkingBudgetRange(url.pathname);
    if (originalThinkingBudget < modelThinkingBudgetRange[0]) {
      originalRequestBody.generationConfig.thinkingConfig.thinkingBudget = modelThinkingBudgetRange[0];
    } else if (originalThinkingBudget > modelThinkingBudgetRange[1]) {
      originalRequestBody.generationConfig.thinkingConfig.thinkingBudget = modelThinkingBudgetRange[1];
    }
  }

  let originalIncludeThoughts = originalRequestBody.generationConfig?.thinkingConfig?.includeThoughts;
  let isIncludeThoughts = (originalIncludeThoughts !== undefined ? originalIncludeThoughts : false) && injectBeginTokenPrompt;
  let currentRequestBody = injectSystemPrompts(originalRequestBody, config, injectBeginTokenPrompt, true);
  let thoughtAccumulatedText = injectBeginTokenPrompt ? config.startOfThought : "";
  let formalAccumulatedText = "";
  let isThoughtFinished = !injectBeginTokenPrompt;

  while (attempts <= config.maxRetries) {
    attempts++;
    let accumulatedTextThisAttempt = "";
    logDebug(config.debugMode, `Non-streaming attempt ${attempts}/${config.maxRetries + 1}`);

    const upstreamUrl = `${config.upstreamUrlBase}${url.pathname}${url.search}`;
    const upstreamRequest = buildUpstreamRequest(upstreamUrl, request, currentRequestBody);

    try {
      const upstreamResponse = await fetch(upstreamRequest);

      if (upstreamResponse.ok) {
        const responseJson = await upstreamResponse.json();
        const parts = responseJson?.candidates?.[0]?.content?.parts || [];

        // 处理 Function Call
        let hasFunctionCall = false;
        let hasFunctionCallParts = [];
        let thoughtAccumulatedTextWithFunctionCall = thoughtAccumulatedText;
        let formalAccumulatedTextWithFunctionCall = formalAccumulatedText;
        let isThoughtFinishedWithFunctionCall = isThoughtFinished;

        for (const part of parts) {
          if (part.functionCall) {
            hasFunctionCall = true;
            hasFunctionCallParts.push(part);
          } else {
            if (part.text && !part.thought) {
              if (!isThoughtFinishedWithFunctionCall && !isFormalResponseStarted_nonStream(part.text)) {
                thoughtAccumulatedTextWithFunctionCall += part.text;
              } else if (!isThoughtFinishedWithFunctionCall && isFormalResponseStarted_nonStream(part.text)) {
                formalAccumulatedTextWithFunctionCall += part.text;
                isThoughtFinishedWithFunctionCall = true;
              } else {
                formalAccumulatedTextWithFunctionCall += part.text;
              }
            }
          }
        }

        if (hasFunctionCall) {
          hasFunctionCallParts.unshift({ text: cleanFinalText(formalAccumulatedTextWithFunctionCall) });
          if (isIncludeThoughts) {
            hasFunctionCallParts.unshift({ text: thoughtAccumulatedTextWithFunctionCall, thought: true });
          }
          responseJson.candidates[0].content.parts = hasFunctionCallParts;
          return new Response(JSON.stringify(responseJson), {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }

        // 累积文本
        for (const part of parts) {
          if (part.text && !part.thought) {
            if (!isThoughtFinished) {
              if (isFormalResponseStarted_nonStream(part.text)) {
                isThoughtFinished = true;
                formalAccumulatedText += part.text;
              } else {
                thoughtAccumulatedText += part.text;
              }
            } else {
              formalAccumulatedText += part.text;
            }
            accumulatedTextThisAttempt += part.text;
          }
        }

        // 检查是否完成
        if (isThoughtFinished && (isResponseComplete(formalAccumulatedText) || isLiteModel)) {
          const finalParts = [];
          if (isIncludeThoughts && thoughtAccumulatedText.length > config.startOfThought.length) {
            finalParts.push({ text: thoughtAccumulatedText, thought: true });
          }
          finalParts.push({ text: cleanFinalText(formalAccumulatedText) });
          responseJson.candidates[0].content.parts = finalParts;
          return new Response(JSON.stringify(responseJson), {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        } else {
          currentRequestBody = buildRetryRequest(currentRequestBody, accumulatedTextThisAttempt);
        }
      } else {
        const errorText = await upstreamResponse.text();
        if (FATAL_STATUS_CODES.includes(upstreamResponse.status)) {
          break;
        }

        let isRetryableStatus = RETRYABLE_STATUS_CODES.includes(upstreamResponse.status);
        if (attempts <= config.maxRetries && upstreamResponse.status == 429) {
          if (!errorText.toLowerCase().includes(`"quota_limit_value":"0"`) &&
              !errorText.includes(`GenerateRequestsPerDayPerProjectPerModel`)) {
            await sleep(500);
          }
        } else if (attempts <= config.maxRetries && upstreamResponse.status == 400) {
          if (errorText.toLowerCase().includes("api key") ||
              errorText.toLowerCase().includes("user location")) {
            isRetryableStatus = true;
          }
        }

        const maxRetriesForThisError = isRetryableStatus ? config.maxRetries : MAX_NON_RETRYABLE_STATUS_RETRIES;
        if (attempts > maxRetriesForThisError) {
          break;
        }
      }
    } catch (error) {
      console.error("Non-streaming request error:", error);
      if (attempts > MAX_FETCH_RETRIES) {
        break;
      }
    }
  }

  // 返回不完整响应
  const finalParts = [];
  if (isIncludeThoughts && thoughtAccumulatedText.length > config.startOfThought.length) {
    finalParts.push({ text: thoughtAccumulatedText, thought: true });
  }
  finalParts.push({ text: `${cleanFinalText(formalAccumulatedText)}\n${INCOMPLETE_TOKEN}` });

  const finalJson = {
    candidates: [{
      content: { parts: finalParts },
      finishReason: "INCOMPLETE"
    }]
  };

  return new Response(JSON.stringify(finalJson), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

// ================= 流式请求处理（第1部分：初始化）=================
async function handleStreamingRequest(request, config, url, modelConfig) {
  const isTargetModel = modelConfig.TARGET_MODELS.some((model) =>
    url.pathname.includes(`${model}:streamGenerateContent`)
  );
  const isNonThinkingByDefaultModel = modelConfig.NON_THINKING_BY_DEFAULT_MODELS.some((model) =>
    url.pathname.includes(`${model}:streamGenerateContent`)
  );
  const isLiteModel = url.pathname.toLowerCase().includes(`flash-lite`);

  if (!isTargetModel) {
    const upstreamUrl = `${config.upstreamUrlBase}${url.pathname}${url.search}`;
    const upstreamRequest = new Request(upstreamUrl, request);
    return fetch(upstreamRequest);
  }

  const originalRequestBody = await request.json();

  if (isStructuredOutputRequest(originalRequestBody)) {
    const upstreamUrl = `${config.upstreamUrlBase}${url.pathname}${url.search}`;
    const upstreamRequest = buildUpstreamRequest(upstreamUrl, request, originalRequestBody);
    return fetch(upstreamRequest);
  }

  let isFromCherryRequest = isCherryRequest(request);
  let injectBeginTokenPrompt = !isNonThinkingByDefaultModel;
  let originalThinkingBudget = originalRequestBody.generationConfig?.thinkingConfig?.thinkingBudget;

  if (originalThinkingBudget !== undefined && originalThinkingBudget === 0) {
    injectBeginTokenPrompt = false;
  }

  if (originalThinkingBudget !== undefined && originalThinkingBudget > 0) {
    injectBeginTokenPrompt = true;
    let modelThinkingBudgetRange = getModelThinkingBudgetRange(url.pathname);
    if (originalThinkingBudget < modelThinkingBudgetRange[0]) {
      originalRequestBody.generationConfig.thinkingConfig.thinkingBudget = modelThinkingBudgetRange[0];
    } else if (originalThinkingBudget > modelThinkingBudgetRange[1]) {
      originalRequestBody.generationConfig.thinkingConfig.thinkingBudget = modelThinkingBudgetRange[1];
    }
  }

  let originalIncludeThoughts = originalRequestBody.generationConfig?.thinkingConfig?.includeThoughts;
  let isIncludeThoughts = (originalIncludeThoughts !== undefined ? originalIncludeThoughts : false) && injectBeginTokenPrompt;

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let isThoughtFinished = !injectBeginTokenPrompt;
  const TOKEN_LEN = FINISHED_TOKEN.length;
  const LOOKAHEAD_SIZE = TOKEN_LEN + 4;

  // 流式处理主逻辑
  const process = async () => {
    let attempts = 0;
    let currentRequestBody = injectSystemPrompts(originalRequestBody, config, injectBeginTokenPrompt, true);
    let lineBuffer = "";
    let textBuffer = "";
    let linesBuffer = [];
    let isFirstOutput = true;
    let lastSendChar = "";

    while (attempts <= config.maxRetries) {
      attempts++;
      let hasGotBeginToken = false;
      let accumulatedTextThisAttempt = "";
      let hasFunctionCallInStream = false;
      let passthroughMode = false;
      lineBuffer = "";
      textBuffer = "";
      linesBuffer = [];

      const upstreamUrl = `${config.upstreamUrlBase}${url.pathname}${url.search}`;
      const upstreamRequest = buildUpstreamRequest(upstreamUrl, request, currentRequestBody);

      try {
        const upstreamResponse = await fetch(upstreamRequest);

        if (upstreamResponse.ok) {
          const reader = upstreamResponse.body.getReader();
          let timeoutId;
          let isFirstData = true;
          const INITIAL_TIMEOUT_DURATION = 20000;
          const SUBSEQUENT_TIMEOUT_DURATION = 4000;
