/**
 * Provedores suportados e conversão de mensagens.
 *
 * Todas as chamadas saem do navegador direto para o provedor (CORS habilitado por eles).
 * Cada provedor declara: endpoint padrão, formato de autenticação, dialeto de payload e modelo
 * padrão. O streaming é unificado em `streamChat`, que produz eventos:
 *   { type: "text", text }        — fragmento de resposta
 *   { type: "done", usage }       — fim
 *   { type: "error", error }      — falha
 */

export const PROVIDERS = {
  openai: {
    label: "OpenAI",
    hint: "Chaves em platform.openai.com → API keys. Modelos: gpt-4.1, gpt-4.1-mini, o4-mini.",
    baseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4.1-mini",
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "o4-mini"],
    style: "openai",
    modelsEndpoint: "/models",
  },
  anthropic: {
    label: "Anthropic",
    hint: "Chaves em console.anthropic.com. Modelos: claude-sonnet-4-5, claude-haiku-4-5.",
    baseUrl: "https://api.anthropic.com/v1",
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-sonnet-4-5",
    models: ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"],
    style: "anthropic",
  },
  openrouter: {
    label: "OpenRouter",
    hint: "Uma chave para centenas de modelos (inclusive grátis, com sufixo :free).",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    models: [
      "meta-llama/llama-3.3-70b-instruct:free",
      "deepseek/deepseek-chat:free",
      "qwen/qwen-2.5-72b-instruct:free",
      "anthropic/claude-sonnet-4.5",
      "openai/gpt-4.1-mini",
      "google/gemini-2.5-flash",
    ],
    style: "openai",
    modelsEndpoint: "/models",
  },
  gemini: {
    label: "Google Gemini",
    hint: "Chaves em aistudio.google.com/apikey. Modelos: gemini-2.5-flash, gemini-2.5-pro. O modelo vai na URL.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    keyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
    style: "gemini",
    modelsEndpoint: "/models",
    authIn: "query",
  },
  groq: {
    label: "Groq",
    hint: "Inferência muito rápida de modelos abertos (Llama, Qwen, Kimi). Chave em console.groq.com/keys.",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen/qwen3-32b", "moonshotai/kimi-k2-instruct"],
    style: "openai",
    modelsEndpoint: "/models",
  },
  mistral: {
    label: "Mistral",
    hint: "Chaves em console.mistral.ai. Modelos: mistral-large-latest, mistral-small-latest.",
    baseUrl: "https://api.mistral.ai/v1",
    keyUrl: "https://console.mistral.ai/api-keys/",
    defaultModel: "mistral-small-latest",
    models: ["mistral-large-latest", "mistral-small-latest", "magistral-medium-latest", "codestral-latest"],
    style: "openai",
    modelsEndpoint: "/models",
  },
  deepseek: {
    label: "DeepSeek",
    hint: "Chaves em platform.deepseek.com. Modelos: deepseek-chat e deepseek-reasoner.",
    baseUrl: "https://api.deepseek.com/v1",
    keyUrl: "https://platform.deepseek.com/api_keys",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    style: "openai",
    modelsEndpoint: "/models",
  },
  ollama: {
    label: "Ollama (local)",
    hint: "Sem chave. Rode `ollama serve` com OLLAMA_ORIGINS=* para liberar o navegador e use um modelo já baixado.",
    baseUrl: "http://localhost:11434/v1",
    keyUrl: "https://ollama.com/download",
    defaultModel: "llama3.2",
    models: ["llama3.2", "qwen2.5", "gemma3", "llava"],
    style: "openai",
    modelsEndpoint: "/models",
    needsKey: false,
  },
  custom: {
    label: "Customizado",
    hint: "Qualquer endpoint compatível com OpenAI: LiteLLM, vLLM, LM Studio, Together, Fireworks, seu servidor…",
    baseUrl: "https://",
    keyUrl: "",
    defaultModel: "",
    models: [],
    style: "openai",
    modelsEndpoint: "/models",
  },
  demo: {
    label: "Demonstração",
    hint: "Sem chave e sem rede: responde localmente com um texto de exemplo. Serve para conhecer a interface.",
    baseUrl: "",
    keyUrl: "",
    defaultModel: "demo-local",
    models: ["demo-local"],
    style: "demo",
    needsKey: false,
  },
};

export const DEFAULT_SYSTEM = "Você é um assistente direto e útil. Responda em português do Brasil, com exemplos quando ajudar.";

/* ------------------------------------------------------------------ helpers */

function imagePartFromDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], data: match[2] };
}

/** Converte anexos {name, dataUrl} em partes de imagem no formato OpenAI. */
function openaiImageParts(images = []) {
  return images
    .map((image) => imagePartFromDataUrl(image.dataUrl))
    .filter(Boolean)
    .map((image) => ({ type: "image_url", image_url: { url: `data:${image.mime};base64,${image.data}` } }));
}

function anthropicImageParts(images = []) {
  return images
    .map((image) => imagePartFromDataUrl(image.dataUrl))
    .filter(Boolean)
    .map((image) => ({ type: "image", source: { type: "base64", media_type: image.mime, data: image.data } }));
}

function geminiParts(text, images = []) {
  const parts = [];
  for (const image of images) {
    const parsed = imagePartFromDataUrl(image.dataUrl);
    if (parsed) parts.push({ inline_data: { mime_type: parsed.mime, data: parsed.data } });
  }
  if (text) parts.push({ text });
  return parts;
}

/** Mensagens no formato OpenAI-compatible (texto + imagens). */
export function toOpenAIMessages(system, messages) {
  const out = system ? [{ role: "system", content: system }] : [];
  for (const message of messages) {
    if (message.role === "assistant") {
      out.push({ role: "assistant", content: message.content || "" });
      continue;
    }
    const images = message.images || [];
    if (!images.length) {
      out.push({ role: "user", content: message.content });
      continue;
    }
    const parts = [{ type: "text", text: message.content || "Descreva a imagem." }, ...openaiImageParts(images)];
    out.push({ role: "user", content: parts });
  }
  return out;
}

/** Mensagens no formato Anthropic (system separado, imagens em blocos). */
export function toAnthropicMessages(messages) {
  return messages.map((message) => {
    if (message.role === "assistant") return { role: "assistant", content: message.content || "" };
    const images = message.images || [];
    if (!images.length) return { role: "user", content: message.content };
    return {
      role: "user",
      content: [
        ...anthropicImageParts(images),
        { type: "text", text: message.content || "Descreva a imagem." },
      ],
    };
  });
}

/** Mensagens no formato Gemini (contents + parts). */
export function toGeminiContents(messages) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: geminiParts(message.content, message.images || []),
  }));
}

/* ------------------------------------------------------------- requisições */

/** Une base + caminho sem duplicar `/v1`, que alguns usuários colam no lugar errado. */
export function joinUrl(baseUrl, path) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/v1") && suffix.startsWith("/v1/")) return base + suffix.slice(3);
  return base + suffix;
}

function buildRequest({ provider, apiKey, baseUrl, model, system, messages, temperature, maxTokens, stream }) {
  const headers = { "Content-Type": "application/json" };
  const style = provider.style;

  if (style === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
    const body = {
      model,
      max_tokens: maxTokens,
      temperature,
      stream,
      messages: toAnthropicMessages(messages),
    };
    if (system) body.system = system;
    return { url: joinUrl(baseUrl, "/messages"), headers, body };
  }

  if (style === "gemini") {
    const action = stream ? "streamGenerateContent" : "generateContent";
    const params = new URLSearchParams({ alt: stream ? "sse" : "json" });
    if (apiKey) params.set("key", apiKey);
    const body = {
      contents: toGeminiContents(messages),
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    return { url: `${joinUrl(baseUrl, `/models/${encodeURIComponent(model)}:${action}`)}?${params}`, headers, body };
  }

  // OpenAI e compatíveis
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const body = {
    model,
    messages: toOpenAIMessages(system, messages),
    temperature,
    stream,
  };
  if (maxTokens) body.max_tokens = maxTokens;
  return { url: joinUrl(baseUrl, "/chat/completions"), headers, body };
}

async function readError(response) {
  let detail = "";
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.error?.message || parsed?.message || JSON.stringify(parsed).slice(0, 800);
    } catch {
      detail = text.slice(0, 800);
    }
  } catch {
    detail = "(corpo da resposta ilegível)";
  }
  return `HTTP ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ""}`;
}

function explain(error) {
  const message = String(error?.message || error);
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return (
      "Não consegui falar com o provedor. Causas comuns: (1) chave/URL errada; (2) o provedor bloqueou CORS " +
      "para este site — para Ollama, rode com OLLAMA_ORIGINS=*; para APIs próprias, libere o header Authorization; " +
      "(3) sem internet ou provedor fora do ar."
    );
  }
  return message;
}

async function* parseSse(response, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload) yield payload;
      }
    }
  }
  if (buffer.trim().startsWith("data:")) yield buffer.trim().slice(5).trim();
}

/** Executa o chat e entrega eventos de streaming. */
export async function* streamChat(options) {
  const { signal, onRaw } = options;
  const provider = options.provider;
  const stream = Boolean(options.stream) && provider.style !== "demo";

  if (provider.style === "demo") {
    yield* demoStream(options.messages.at(-1)?.content || "");
    return;
  }

  const { url, headers, body } = buildRequest({ ...options, stream });
  onRaw?.(`→ POST ${url}\n${JSON.stringify({ ...body, messages: `[${options.messages.length} mensagens]` }, null, 1)}`);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
      mode: "cors",
    });
  } catch (error) {
    if (error?.name === "AbortError") return;
    throw new Error(explain(error));
  }

  if (!response.ok) throw new Error(await readError(response));

  const usage = { input: null, output: null };
  const contentType = response.headers.get("content-type") || "";

  if (!stream) {
    const data = await response.json();
    onRaw?.(`← ${JSON.stringify(data).slice(0, 1200)}`);
    if (provider.style === "anthropic") {
      for (const block of data.content || []) if (block.type === "text") yield { type: "text", text: block.text };
      usage.input = data.usage?.input_tokens ?? null;
      usage.output = data.usage?.output_tokens ?? null;
    } else if (provider.style === "gemini") {
      for (const candidate of data.candidates || []) {
        for (const part of candidate.content?.parts || []) if (part.text) yield { type: "text", text: part.text };
      }
      usage.input = data.usageMetadata?.promptTokenCount ?? null;
      usage.output = data.usageMetadata?.candidatesTokenCount ?? null;
    } else {
      const text = data.choices?.[0]?.message?.content || "";
      if (text) yield { type: "text", text };
      usage.input = data.usage?.prompt_tokens ?? null;
      usage.output = data.usage?.completion_tokens ?? null;
    }
    yield { type: "done", usage };
    return;
  }

  // Streaming: o Gemini pode devolver JSON puro mesmo pedindo SSE.
  if (provider.style === "gemini" && !contentType.includes("event-stream")) {
    const data = await response.json();
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      for (const candidate of item.candidates || []) {
        for (const part of candidate.content?.parts || []) if (part.text) yield { type: "text", text: part.text };
      }
      usage.input = item.usageMetadata?.promptTokenCount ?? usage.input;
      usage.output = item.usageMetadata?.candidatesTokenCount ?? usage.output;
    }
    yield { type: "done", usage };
    return;
  }

  for await (const payload of parseSse(response, signal)) {
    if (signal?.aborted) return;
    if (payload === "[DONE]") break;
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      continue;
    }
    if (event.error) throw new Error(event.error.message || JSON.stringify(event.error));

    if (provider.style === "anthropic") {
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      } else if (event.type === "message_start") {
        usage.input = event.message?.usage?.input_tokens ?? null;
      } else if (event.type === "message_delta") {
        usage.output = event.usage?.output_tokens ?? usage.output;
      }
      continue;
    }

    if (provider.style === "gemini") {
      for (const candidate of event.candidates || []) {
        for (const part of candidate.content?.parts || []) if (part.text) yield { type: "text", text: part.text };
      }
      usage.input = event.usageMetadata?.promptTokenCount ?? usage.input;
      usage.output = event.usageMetadata?.candidatesTokenCount ?? usage.output;
      continue;
    }

    const choice = event.choices?.[0];
    const delta = choice?.delta?.content ?? choice?.text ?? "";
    if (delta) yield { type: "text", text: delta };
    if (event.usage) {
      usage.input = event.usage.prompt_tokens ?? usage.input;
      usage.output = event.usage.completion_tokens ?? usage.output;
    }
  }
  yield { type: "done", usage };
}

/** Lista modelos do provedor quando ele expõe `/models`. */
export async function listModels({ provider, apiKey, baseUrl }) {
  if (!provider.modelsEndpoint) throw new Error("Este provedor não expõe uma lista de modelos própria.");
  const headers = {};
  const params = new URLSearchParams();
  if (provider.style === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  } else if (provider.style === "gemini") {
    if (apiKey) params.set("key", apiKey);
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const url = joinUrl(baseUrl, provider.modelsEndpoint) + (params.toString() ? `?${params}` : "");
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(await readError(response));
  const data = await response.json();
  const raw = data.data || data.models || [];
  return raw
    .map((item) => item.id || item.name?.replace(/^models\//, "") || "")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

/* ---------------------------------------------------------------- demo local */

async function* demoStream(userText) {
  const words = userText.trim().split(/\s+/).filter(Boolean).length;
  const lines = [
    "Você está no modo **Demonstração**: nada foi enviado a nenhum provedor, esta resposta é gerada localmente.",
    "",
    `Sua mensagem tinha ${words} ${words === 1 ? "palavra" : "palavras"}. Para conversar de verdade, abra **Configurações**,`,
    "escolha um provedor (OpenAI, Anthropic, OpenRouter, Gemini, Groq, Mistral, DeepSeek ou Ollama) e cole a sua chave de API.",
    "",
    "Exemplo de formatação aceita:",
    "",
    "```python",
    "print('olá, mundo')",
    "```",
    "",
    "| Provedor | Precisa de chave |",
    "|---|---|",
    "| OpenAI | sim |",
    "| Ollama local | não |",
    "| Demonstração | não |",
  ];
  const reply = `${lines.join("\n")}\n`;
  for (const piece of reply.match(/[\s\S]{1,14}/g) || []) {
    await new Promise((resolve) => setTimeout(resolve, 12));
    yield { type: "text", text: piece };
  }
  yield { type: "done", usage: { input: null, output: null } };
}
