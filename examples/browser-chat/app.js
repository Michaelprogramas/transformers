/**
 * Chat Local — lógica do app. 100% no navegador: sem backend, sem bundler.
 *
 * Estado persistido em localStorage:
 *   browser-chat:settings   → { providerId, apiKeys: {id: chave}, models: {id: modelo}, baseUrls, temperatura… }
 *   browser-chat:chats      → [ { id, title, createdAt, updatedAt, providerId, model, messages: [...] } ]
 */

import { DEFAULT_SYSTEM, PROVIDERS, listModels, streamChat } from "./providers.js";
import { escapeHtml, renderMarkdown } from "./markdown.js";

const SETTINGS_KEY = "browser-chat:settings";
const CHATS_KEY = "browser-chat:chats";
const THEME_KEY = "browser-chat:theme";

const DEFAULT_SETTINGS = {
  providerId: "openai",
  apiKeys: {},
  models: {},
  baseUrls: {},
  temperature: 0.7,
  maxTokens: 1024,
  stream: true,
  system: DEFAULT_SYSTEM,
};

/* ------------------------------------------------------------------ estado */

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function loadChats() {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const state = {
  settings: loadJson(SETTINGS_KEY, DEFAULT_SETTINGS),
  chats: loadChats(),
  activeId: null,
  filter: "",
  pendingImages: [],
  generating: false,
  abort: null,
};

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function saveChats() {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(state.chats));
  } catch (error) {
    toast("Armazenamento cheio: exporte e apague conversas antigas.");
    console.warn(error);
  }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function activeChat() {
  return state.chats.find((chat) => chat.id === state.activeId) || null;
}

function currentProvider() {
  return PROVIDERS[state.settings.providerId] || PROVIDERS.openai;
}

function currentKey(providerId = state.settings.providerId) {
  return state.settings.apiKeys[providerId] || "";
}

function currentModel(providerId = state.settings.providerId) {
  const provider = PROVIDERS[providerId];
  return state.settings.models[providerId] || provider?.defaultModel || "";
}

function currentBaseUrl(providerId = state.settings.providerId) {
  const provider = PROVIDERS[providerId];
  return state.settings.baseUrls[providerId] || provider?.baseUrl || "";
}

/* ----------------------------------------------------------------- helpers */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function toast(message, ms = 2600) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), ms);
}

function formatTime(iso) {
  const date = new Date(iso);
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function relativeDate(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Estimativa grosseira: ~4 caracteres por token. */
function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

function contextTokens(chat) {
  if (!chat) return 0;
  const body = chat.messages.map((message) => message.content || "").join("\n");
  return estimateTokens(body) + estimateTokens(state.settings.system);
}

function download(filename, content, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copiado!");
  } catch {
    toast("O navegador bloqueou a cópia. Selecione e use Ctrl+C.");
  }
}

/* -------------------------------------------------------------- conversas */

function createChat() {
  const chat = {
    id: uid(),
    title: "Nova conversa",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    providerId: state.settings.providerId,
    model: currentModel(),
    messages: [],
  };
  state.chats.unshift(chat);
  state.activeId = chat.id;
  saveChats();
  render();
  $("#input")?.focus();
  return chat;
}

function openChat(id) {
  state.activeId = id;
  render();
  $("#messages").scrollTop = $("#messages").scrollHeight;
}

function deleteChat(id) {
  const chat = state.chats.find((item) => item.id === id);
  if (!chat) return;
  if (chat.messages.length && !confirm(`Apagar “${chat.title}”?`)) return;
  state.chats = state.chats.filter((item) => item.id !== id);
  if (state.activeId === id) state.activeId = state.chats[0]?.id || null;
  saveChats();
  render();
}

function clearMessages() {
  const chat = activeChat();
  if (!chat || !chat.messages.length) return;
  if (!confirm("Limpar todas as mensagens desta conversa?")) return;
  chat.messages = [];
  chat.title = "Nova conversa";
  chat.updatedAt = new Date().toISOString();
  saveChats();
  render();
}

function deriveTitle(chat, text) {
  if (chat.messages.length > 1) return;
  const clean = text.replace(/\s+/g, " ").trim();
  chat.title = clean.length > 46 ? `${clean.slice(0, 46)}…` : clean || "Nova conversa";
}

/* ---------------------------------------------------------------- render */

function render() {
  const chat = activeChat();
  renderSidebar(chat);
  renderHeader(chat);
  renderMessages(chat);
  renderPill();
  renderComposerState();
}

function renderSidebar(chat) {
  const container = $("#conversations");
  const filter = state.filter.toLowerCase();
  const items = state.chats.filter((item) => !filter || item.title.toLowerCase().includes(filter));
  if (!items.length) {
    container.innerHTML = `<div class="conv-empty">${state.chats.length ? "Nada encontrado." : "Nenhuma conversa ainda. Clique em “Nova conversa”."}</div>`;
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
      <button class="conv-item ${item.id === state.activeId ? "active" : ""}" data-chat="${item.id}">
        <span class="conv-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
        <span class="conv-del" data-del="${item.id}" role="button" title="Apagar conversa">
          <svg class="icon"><use href="#i-trash" /></svg>
        </span>
      </button>`,
    )
    .join("");
}

function renderHeader(chat) {
  $("#chat-title").textContent = chat?.title || "Nova conversa";
  const count = chat?.messages.length || 0;
  const provider = PROVIDERS[chat?.providerId] || currentProvider();
  const model = chat?.model || currentModel();
  $("#chat-sub").textContent = count
    ? `${count} mensagen${count === 1 ? "" : "s"} · ${provider.label} · ${model || "sem modelo"}`
    : "nenhuma mensagem ainda";
  $("#token-estimate").textContent = `${contextTokens(chat)} tokens no contexto (estimativa)`;
}

function renderPill() {
  const provider = currentProvider();
  const key = currentKey();
  const model = currentModel();
  $("#pill-text").textContent = `${provider.label}${model ? ` · ${model}` : ""}`;
  const dot = $("#pill-dot");
  dot.className = "dot";
  if (provider.needsKey === false) dot.classList.add("ok");
  else if (key) dot.classList.add("ok");
  else dot.classList.add("warn");
  dot.title = provider.needsKey === false ? "funciona sem chave" : key ? "chave configurada" : "falta a chave de API";
}

function messageHtml(message, index) {
  const isUser = message.role === "user";
  const images = message.images || [];
  const imagesRow = images.length
    ? `<div class="attachments-row">${images
        .map((image) => `<img src="${escapeHtml(image.dataUrl)}" alt="${escapeHtml(image.name || "imagem")}" />`)
        .join("")}</div>`
    : "";
  const meta = [
    message.model || "",
    message.usage?.input ? `${message.usage.input}→${message.usage.output ?? "?"} tokens` : "",
    formatTime(message.at || new Date().toISOString()),
  ]
    .filter(Boolean)
    .join(" · ");
  const body = message.error
    ? `<div class="error-box"><strong>Erro:</strong> ${escapeHtml(message.error)}</div>`
    : `<div class="bubble">${imagesRow}${isUser ? `<p>${escapeHtml(message.content).replace(/\n/g, "<br />")}</p>` : renderMarkdown(message.content || "")}</div>`;

  return `
    <article class="msg ${isUser ? "user" : "assistant"}" data-index="${index}">
      <div class="avatar">${isUser ? "VC" : "IA"}</div>
      <div class="msg-body">
        <div class="msg-head">
          <span class="msg-role">${isUser ? "Você" : escapeHtml(message.providerLabel || "Assistente")}</span>
          <span class="msg-meta">${escapeHtml(meta)}</span>
          <span class="msg-actions">
            <button class="btn-icon" data-copy="${index}" title="Copiar mensagem"><svg class="icon"><use href="#i-copy" /></svg></button>
            ${isUser ? "" : `<button class="btn-icon" data-edit="${index}" title="Editar e reenviar a partir daqui"><svg class="icon"><use href="#i-pencil" /></svg></button>`}
            <button class="btn-icon" data-regen="${index}" title="Gerar novamente"><svg class="icon"><use href="#i-refresh" /></svg></button>
          </span>
        </div>
        ${body}
      </div>
    </article>`;
}

function renderMessages(chat) {
  const container = $("#messages");
  const empty = $("#empty-state");
  const messages = chat?.messages || [];
  if (!messages.length) {
    empty.hidden = false;
    container.querySelectorAll(".msg").forEach((node) => node.remove());
    return;
  }
  empty.hidden = true;
  container.innerHTML = messages.map((message, index) => messageHtml(message, index)).join("");
  container.scrollTop = container.scrollHeight;
}

function renderComposerState() {
  const send = $("#send-btn");
  send.disabled = state.generating ? false : !$("#input").value.trim() && !state.pendingImages.length;
  send.classList.toggle("stop", state.generating);
  send.innerHTML = state.generating
    ? `<svg class="icon"><use href="#i-stop" /></svg>`
    : `<svg class="icon"><use href="#i-send" /></svg>`;
  send.title = state.generating ? "Parar geração" : "Enviar";
  $("#composer-status").textContent = state.generating ? `gerando com ${currentModel() || currentProvider().label}…` : "pronto";

  const box = $("#attachments");
  box.innerHTML = state.pendingImages
    .map(
      (image, index) => `
      <div class="attachment">
        <img src="${image.dataUrl}" alt="${escapeHtml(image.name)}" />
        <span>${escapeHtml(image.name)}</span>
        <button data-remove-image="${index}" title="Remover"><svg class="icon"><use href="#i-close" /></svg></button>
      </div>`,
    )
    .join("");
}

/* ------------------------------------------------------------- mensagens */

function appendMessage(chat, message) {
  chat.messages.push(message);
  chat.updatedAt = new Date().toISOString();
  saveChats();
}

async function sendMessage(textOverride) {
  if (state.generating) {
    state.abort?.abort();
    return;
  }
  const input = $("#input");
  const text = (textOverride ?? input.value).trim();
  const images = [...state.pendingImages];
  if (!text && !images.length) return;

  const provider = currentProvider();
  const apiKey = currentKey();
  const model = currentModel();
  if (provider.needsKey !== false && !apiKey) {
    toast("Configure a chave de API em Configurações.");
    openSettings();
    return;
  }
  if (!model) {
    toast("Defina um modelo em Configurações.");
    openSettings();
    return;
  }

  const chat = activeChat() || createChat();
  if (!chat.providerId) chat.providerId = state.settings.providerId;
  chat.model = model;
  chat.providerId = state.settings.providerId;

  const userMessage = { role: "user", content: text, images, at: new Date().toISOString() };
  appendMessage(chat, userMessage);
  deriveTitle(chat, text);

  input.value = "";
  autosize();
  state.pendingImages = [];
  render();
  await generate(chat);
}

async function generate(chat) {
  const provider = currentProvider();
  const key = currentKey();
  const model = currentModel();
  const baseUrl = currentBaseUrl();

  const draft = {
    role: "assistant",
    content: "",
    providerLabel: provider.label,
    model,
    at: new Date().toISOString(),
  };
  appendMessage(chat, draft);
  const index = chat.messages.length - 1;
  renderMessages(chat);
  const article = document.querySelector(`.msg[data-index="${index}"]`);
  const bubble = article?.querySelector(".bubble");
  if (bubble) bubble.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;

  state.generating = true;
  state.abort = new AbortController();
  renderComposerState();

  let raw = "";
  try {
    const history = chat.messages.slice(0, index).map((message) => ({
      role: message.role,
      content: message.content,
      images: message.images,
    }));
    const events = streamChat({
      provider,
      apiKey: key,
      baseUrl,
      model,
      system: state.settings.system,
      messages: history,
      temperature: Number(state.settings.temperature),
      maxTokens: Number(state.settings.maxTokens),
      stream: state.settings.stream,
      signal: state.abort.signal,
      onRaw: (line) => {
        raw += `${line}\n`;
      },
    });

    for await (const event of events) {
      if (event.type === "text") {
        draft.content += event.text;
        if (bubble) bubble.innerHTML = renderMarkdown(draft.content);
        const container = $("#messages");
        container.scrollTop = container.scrollHeight;
      } else if (event.type === "done") {
        draft.usage = event.usage;
        draft.raw = raw;
      }
    }
    if (!draft.content) {
      draft.content = "_(o provedor não retornou texto)_";
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      draft.content += draft.content ? "\n\n_(interrompido)_" : "_(interrompido)_";
    } else {
      draft.error = error?.message || String(error);
      draft.raw = raw;
    }
  } finally {
    state.generating = false;
    state.abort = null;
    saveChats();
    render();
    renderComposerState();
  }
}

async function regenerate(index) {
  const chat = activeChat();
  if (!chat || state.generating) return;
  chat.messages = chat.messages.slice(0, index);
  saveChats();
  render();
  await generate(chat);
}

async function editFrom(index) {
  const chat = activeChat();
  const message = chat?.messages[index];
  if (!chat || !message || state.generating) return;
  $("#input").value = message.content;
  state.pendingImages = message.images || [];
  chat.messages = chat.messages.slice(0, index);
  saveChats();
  render();
  autosize();
  $("#input").focus();
}

/* --------------------------------------------------------------- imagens */

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addImages(files) {
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      toast(`${file.name}: apenas imagens são aceitas.`);
      continue;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast(`${file.name}: maior que 4 MB.`);
      continue;
    }
    const dataUrl = await readFileAsDataUrl(file);
    state.pendingImages.push({ name: file.name, dataUrl });
  }
  renderComposerState();
}

/* ------------------------------------------------------------ configurações */

function openSettings() {
  const settings = state.settings;
  const grid = $("#provider-grid");
  grid.innerHTML = Object.entries(PROVIDERS)
    .map(
      ([id, provider]) => `
      <button type="button" class="provider-card ${id === settings.providerId ? "active" : ""}" data-provider="${id}">
        <strong>${escapeHtml(provider.label)}</strong>
        <small>${escapeHtml(provider.defaultModel || "modelo manual")}</small>
        ${settings.apiKeys[id] ? '<span class="kstate">✓ chave salva</span>' : ""}
      </button>`,
    )
    .join("");
  syncSettingsFields();
  $("#settings-dialog").showModal();
}

function syncSettingsFields() {
  const settings = state.settings;
  const provider = currentProvider();
  const key = currentKey();

  $$("#provider-grid .provider-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.provider === settings.providerId);
  });

  $("#provider-hint").textContent = provider.hint;
  $("#api-key").value = key;
  $("#api-key").placeholder = provider.needsKey === false ? "não é necessária para este provedor" : "cole sua chave aqui";
  $("#api-key").disabled = provider.needsKey === false;

  const status = $("#key-status");
  status.textContent = key ? "chave salva" : provider.needsKey === false ? "sem chave (ok)" : "sem chave";
  status.className = `badge ${key || provider.needsKey === false ? "ok" : "bad"}`;

  const link = $("#key-link");
  if (provider.keyUrl) {
    link.href = provider.keyUrl;
    link.hidden = false;
  } else {
    link.hidden = true;
  }

  $("#model-input").value = currentModel();
  $("#model-input").readOnly = provider.style === "demo";
  const list = $("#model-list");
  list.innerHTML = (provider.models || []).map((model) => `<option value="${escapeHtml(model)}"></option>`).join("");
  $("#model-hint").textContent = provider.style === "demo"
    ? "O modo demonstração responde localmente."
    : provider.modelsEndpoint
      ? "Digite um modelo ou clique em “buscar” para consultar a lista do provedor."
      : "Digite o identificador exato do modelo.";

  $("#base-url").value = currentBaseUrl();
  $("#base-url").disabled = provider.style === "demo";
  $("#base-url").placeholder = provider.baseUrl || "https://…";

  $("#temperature").value = settings.temperature;
  $("#temperature-out").value = Number(settings.temperature).toFixed(1);
  $("#max-tokens").value = settings.maxTokens;
  $("#streaming").checked = Boolean(settings.stream);
  $("#system-prompt").value = settings.system;
}

function selectProvider(id) {
  state.settings.providerId = id;
  const provider = PROVIDERS[id];
  if (!state.settings.models[id] && provider.defaultModel) state.settings.models[id] = provider.defaultModel;
  saveSettings();
  syncSettingsFields();
  renderPill();
}

function bindSettings() {
  $("#provider-grid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-provider]");
    if (card) selectProvider(card.dataset.provider);
  });

  $("#api-key").addEventListener("input", (event) => {
    const id = state.settings.providerId;
    const value = event.target.value.trim();
    if (value) state.settings.apiKeys[id] = value;
    else delete state.settings.apiKeys[id];
    saveSettings();
    syncSettingsFields();
    renderPill();
  });

  $("#toggle-key").addEventListener("click", () => {
    const input = $("#api-key");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    $("#toggle-key").textContent = show ? "ocultar" : "mostrar";
  });

  $("#clear-key").addEventListener("click", () => {
    delete state.settings.apiKeys[state.settings.providerId];
    saveSettings();
    syncSettingsFields();
    renderPill();
    toast("Chave removida deste navegador.");
  });

  $("#model-input").addEventListener("input", (event) => {
    state.settings.models[state.settings.providerId] = event.target.value.trim();
    saveSettings();
    renderPill();
  });

  $("#fetch-models").addEventListener("click", async () => {
    const button = $("#fetch-models");
    button.disabled = true;
    button.textContent = "buscando…";
    try {
      const models = await listModels({
        provider: currentProvider(),
        apiKey: currentKey(),
        baseUrl: currentBaseUrl(),
      });
      $("#model-list").innerHTML = models.map((model) => `<option value="${escapeHtml(model)}"></option>`).join("");
      toast(`${models.length} modelos encontrados. Digite ou escolha na lista.`);
    } catch (error) {
      toast(`Falha ao buscar modelos: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = "buscar";
    }
  });

  $("#base-url").addEventListener("input", (event) => {
    state.settings.baseUrls[state.settings.providerId] = event.target.value.trim();
    saveSettings();
  });

  $("#temperature").addEventListener("input", (event) => {
    state.settings.temperature = Number(event.target.value);
    $("#temperature-out").value = state.settings.temperature.toFixed(1);
    saveSettings();
  });
  $("#max-tokens").addEventListener("input", (event) => {
    state.settings.maxTokens = Number(event.target.value) || 1024;
    saveSettings();
  });
  $("#streaming").addEventListener("change", (event) => {
    state.settings.stream = event.target.checked;
    saveSettings();
  });
  $("#system-prompt").addEventListener("input", (event) => {
    state.settings.system = event.target.value;
    saveSettings();
  });
  $("#reset-system").addEventListener("click", () => {
    state.settings.system = DEFAULT_SYSTEM;
    $("#system-prompt").value = DEFAULT_SYSTEM;
    saveSettings();
  });

  $("#test-connection").addEventListener("click", testConnection);

  $("#export-all").addEventListener("click", () => {
    download(
      `chat-local-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), settings: state.settings, chats: state.chats }, null, 2),
    );
  });

  $("#import-all").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.chats)) throw new Error("arquivo sem lista de conversas");
      const merge = confirm("OK = juntar com as conversas atuais · Cancelar = substituir tudo");
      state.chats = merge ? [...data.chats, ...state.chats] : data.chats;
      if (data.settings) state.settings = { ...state.settings, ...data.settings };
      state.activeId = state.chats[0]?.id || null;
      saveChats();
      saveSettings();
      render();
      toast("Backup importado.");
    } catch (error) {
      toast(`Backup inválido: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  });

  $("#wipe-all").addEventListener("click", () => {
    if (!confirm("Apagar todas as conversas e chaves deste navegador? Não há como desfazer.")) return;
    localStorage.removeItem(CHATS_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    state.chats = [];
    state.settings = structuredClone(DEFAULT_SETTINGS);
    state.activeId = null;
    render();
    syncSettingsFields();
    toast("Tudo apagado.");
  });
}

async function testConnection() {
  const badge = $("#test-result");
  const log = $("#test-log");
  badge.className = "badge warn";
  badge.textContent = "testando…";
  log.hidden = false;
  log.textContent = "";

  const provider = currentProvider();
  const started = performance.now();
  try {
    let received = 0;
    const lines = [];
    for await (const event of streamChat({
      provider,
      apiKey: currentKey(),
      baseUrl: currentBaseUrl(),
      model: currentModel(),
      system: "Responda apenas: ok",
      messages: [{ role: "user", content: "ping" }],
      temperature: 0,
      maxTokens: 24,
      stream: false,
      onRaw: (line) => lines.push(line),
    })) {
      if (event.type === "text") received += event.text.length;
    }
    const ms = Math.round(performance.now() - started);
    badge.className = "badge ok";
    badge.textContent = `ok em ${ms} ms`;
    log.textContent = lines.join("\n") + `\n\n${received} caracteres recebidos.`;
  } catch (error) {
    badge.className = "badge bad";
    badge.textContent = "falhou";
    log.textContent = String(error.message || error);
  }
}

/* ------------------------------------------------------------- exportação */

function exportMarkdown() {
  const chat = activeChat();
  if (!chat) return;
  const lines = [`# ${chat.title}`, "", `_${PROVIDERS[chat.providerId]?.label || chat.providerId} · ${chat.model}_`, ""];
  for (const message of chat.messages) {
    lines.push(message.role === "user" ? "## Você" : `## ${message.providerLabel || "Assistente"}`);
    lines.push("", message.content || "", "");
  }
  download(`${chat.title.replace(/[^\w\-à-ú ]/gi, "").trim() || "conversa"}.md`, lines.join("\n"), "text/markdown");
}

function exportJson() {
  const chat = activeChat();
  if (!chat) return;
  download(`${chat.title.replace(/[^\w\-à-ú ]/gi, "").trim() || "conversa"}.json`, JSON.stringify(chat, null, 2));
}

/* ------------------------------------------------------------------- tema */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  $("#toggle-theme").innerHTML = `<svg class="icon"><use href="#i-${theme === "dark" ? "sun" : "moon"}" /></svg>`;
}

/* ------------------------------------------------------------------ ajuda */

function helpHtml() {
  const providers = Object.entries(PROVIDERS)
    .filter(([id]) => id !== "custom")
    .map(
      ([, provider]) =>
        `<li><strong>${provider.label}</strong> — ${provider.hint}${provider.keyUrl ? ` <a class="link" href="${provider.keyUrl}" target="_blank" rel="noopener noreferrer">obter chave ↗</a>` : ""}</li>`,
    )
    .join("");
  return `
    <h3>Como usar</h3>
    <ol>
      <li>Abra <strong>Configurações</strong>, escolha o provedor e cole a chave de API.</li>
      <li>Defina o modelo (ou clique em “buscar” para listar os disponíveis) e, se quiser, ajuste temperatura e tokens.</li>
      <li>Use “Testar conexão” para confirmar que a chave e o CORS funcionam.</li>
      <li>Digite na caixa de mensagem. Imagens podem ser anexadas com o botão de imagem.</li>
    </ol>
    <h3>Provedores</h3>
    <ul>${providers}</ul>
    <h3>Atalhos de teclado</h3>
    <ul>
      <li><span class="kbd">Enter</span> envia · <span class="kbd">Shift</span>+<span class="kbd">Enter</span> quebra linha</li>
      <li><span class="kbd">Esc</span> para a geração em andamento</li>
      <li><span class="kbd">Ctrl</span>+<span class="kbd">K</span> busca conversas · <span class="kbd">Ctrl</span>+<span class="kbd">N</span> nova conversa</li>
      <li><span class="kbd">Ctrl</span>+<span class="kbd">,</span> abre as configurações</li>
    </ul>
    <h3>Privacidade</h3>
    <p>As chaves e as conversas ficam no <code>localStorage</code> deste navegador. O texto é enviado diretamente ao provedor
    escolhido, sem servidor intermediário. Ao usar um computador compartilhado, apague os dados locais ao terminar.
    Para servir o app por HTTPS (recomendado), veja o <code>README.md</code> desta pasta.</p>
    <h3>Problemas comuns</h3>
    <ul>
      <li><strong>“Não consegui falar com o provedor”</strong> — chave errada, URL errada ou CORS bloqueado. Em APIs próprias,
      libere o header <code>Authorization</code> e o método <code>POST</code>.</li>
      <li><strong>Ollama local</strong> — reinicie com <code>OLLAMA_ORIGINS=* ollama serve</code> para o navegador poder chamar.</li>
      <li><strong>Imagens ignoradas</strong> — o modelo escolhido precisa ser multimodal (ex.: <code>gpt-4.1</code>, <code>claude-sonnet-4-5</code>, <code>gemini-2.5-flash</code>, <code>llava</code>).</li>
    </ul>`;
}

/* ------------------------------------------------------------------ binds */

function autosize() {
  const input = $("#input");
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
}

function bindGlobal() {
  $("#new-chat").addEventListener("click", () => createChat());
  $("#search").addEventListener("input", (event) => {
    state.filter = event.target.value;
    renderSidebar(activeChat());
  });

  $("#conversations").addEventListener("click", (event) => {
    const del = event.target.closest("[data-del]");
    if (del) {
      event.stopPropagation();
      deleteChat(del.dataset.del);
      return;
    }
    const item = event.target.closest("[data-chat]");
    if (item) openChat(item.dataset.chat);
  });

  $("#open-settings").addEventListener("click", openSettings);
  $("#empty-settings").addEventListener("click", openSettings);
  $("#open-help").addEventListener("click", () => {
    $("#help-body").innerHTML = helpHtml();
    $("#help-dialog").showModal();
  });

  $("#toggle-theme").addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  $("#clear-chat").addEventListener("click", clearMessages);
  $("#export-md").addEventListener("click", exportMarkdown);
  $("#export-json").addEventListener("click", exportJson);

  $("#chat-title").addEventListener("dblclick", () => {
    const chat = activeChat();
    if (!chat) return;
    const title = prompt("Novo título da conversa:", chat.title);
    if (title?.trim()) {
      chat.title = title.trim();
      saveChats();
      render();
    }
  });

  const input = $("#input");
  input.addEventListener("input", () => {
    renderComposerState();
    autosize();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
    if (event.key === "Escape" && state.generating) {
      state.abort?.abort();
    }
  });

  $("#send-btn").addEventListener("click", () => sendMessage());
  $("#attach-btn").addEventListener("click", () => $("#file-input").click());
  $("#file-input").addEventListener("change", async (event) => {
    await addImages([...(event.target.files || [])]);
    event.target.value = "";
  });

  $("#attachments").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-image]");
    if (remove) {
      state.pendingImages.splice(Number(remove.dataset.removeImage), 1);
      renderComposerState();
    }
  });

  $("#composer").addEventListener("paste", async (event) => {
    const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
    if (files.length) {
      event.preventDefault();
      await addImages(files);
    }
  });

  document.addEventListener("dragover", (event) => event.preventDefault());
  document.addEventListener("drop", async (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    await addImages([...event.dataTransfer.files]);
  });

  $("#messages").addEventListener("click", (event) => {
    const copyCode = event.target.closest(".copy-code");
    if (copyCode) {
      copyText(copyCode.dataset.code || "");
      return;
    }
    const copy = event.target.closest("[data-copy]");
    if (copy) {
      const message = activeChat()?.messages[Number(copy.dataset.copy)];
      if (message) copyText(message.content || "");
      return;
    }
    const regen = event.target.closest("[data-regen]");
    if (regen) {
      regenerate(Number(regen.dataset.regen));
      return;
    }
    const edit = event.target.closest("[data-edit]");
    if (edit) editFrom(Number(edit.dataset.edit));
  });

  $("#suggestion-chips").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-prompt]");
    if (chip) sendMessage(chip.dataset.prompt);
  });

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "k") {
      event.preventDefault();
      $("#search").focus();
    }
    if (event.ctrlKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      createChat();
    }
    if (event.ctrlKey && event.key === ",") {
      event.preventDefault();
      openSettings();
    }
    if (event.key === "Escape" && state.generating && !document.querySelector("dialog[open]")) {
      state.abort?.abort();
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (state.generating) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}

/* ------------------------------------------------------------------- boot */

function boot() {
  applyTheme(localStorage.getItem(THEME_KEY) || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  bindGlobal();
  bindSettings();

  if (!state.chats.length) {
    state.activeId = null;
  } else {
    state.activeId = state.chats[0].id;
  }
  render();
  autosize();

  if (!state.settings.apiKeys[state.settings.providerId] && state.settings.providerId !== "demo") {
    setTimeout(() => toast("Configure sua chave de API para começar (Ctrl+,)", 4200), 700);
  }
}

boot();
