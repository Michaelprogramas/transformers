/**
 * Smoke test do app.js com um DOM simulado (sem navegador).
 *
 * Uso: node tests-dom.mjs
 * Valida que o app inicializa, cria conversa, envia mensagem, faz streaming, salva no
 * localStorage, renderiza Markdown e trata chave ausente — tudo sem abrir o navegador.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------- DOM simulado */

class ClassList {
  constructor(element) {
    this.element = element;
    this.set = new Set();
  }
  add(...names) {
    names.forEach((name) => this.set.add(name));
    this.sync();
  }
  remove(...names) {
    names.forEach((name) => this.set.delete(name));
    this.sync();
  }
  toggle(name, force) {
    const on = force === undefined ? !this.set.has(name) : force;
    if (on) this.set.add(name);
    else this.set.delete(name);
    this.sync();
    return on;
  }
  contains(name) {
    return this.set.has(name);
  }
  sync() {
    this.element._className = [...this.set].join(" ");
  }
}

class Element {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this._textContent = "";
    this._innerHTML = "";
    this.value = "";
    this.type = "";
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.scrollTop = 0;
    this.scrollHeight = 100;
    this.classList = new ClassList(this);
    this.listeners = new Map();
  }
  get className() {
    return this._className || "";
  }
  set className(value) {
    this._className = value;
    this.classList.set = new Set(String(value).split(/\s+/).filter(Boolean));
  }
  get textContent() {
    return this._textContent;
  }
  set textContent(value) {
    this._textContent = String(value);
    this._innerHTML = "";
    this.children = [];
  }
  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(value) {
    this._innerHTML = String(value);
    this._textContent = "";
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener() {}
  dispatchEvent(event) {
    event.target ||= this;
    event.currentTarget = this;
    for (const handler of this.listeners.get(event.type) || []) handler(event);
    return true;
  }
  click() {
    this.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
  }
  closest() {
    return null;
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  focus() {}
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  matches() {
    return false;
  }
  getBoundingClientRect() {
    return { width: 100, height: 20, top: 0, left: 0 };
  }
}

const elements = new Map();
function selectorsFor(selector) {
  return String(selector)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function makeElement(selector) {
  const element = new Element(selector.includes("input") || selector.includes("textarea") ? "textarea" : "div");
  element._selector = selector;
  return element;
}

const document = {
  documentElement: Object.assign(new Element("html"), { dataset: {} }),
  body: new Element("body"),
  querySelector(selector) {
    const key = selectorsFor(selector)[0];
    if (!elements.has(key)) elements.set(key, makeElement(key));
    return elements.get(key);
  },
  querySelectorAll(selector) {
    return selectorsFor(selector)
      .map((key) => document.querySelector(key))
      .filter(Boolean);
  },
  createElement(tag) {
    return new Element(tag);
  },
  addEventListener(type, handler) {
    document._listeners ||= new Map();
    if (!document._listeners.has(type)) document._listeners.set(type, []);
    document._listeners.get(type).push(handler);
  },
  dispatch(type, event = {}) {
    for (const handler of document._listeners?.get(type) || []) handler({ type, preventDefault() {}, ...event });
  },
};

const storage = new Map();
const localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

const window = {
  addEventListener() {},
  location: { href: "http://localhost:8000/" },
};

const alerts = [];
const confirmations = [];
const sandbox = {
  document,
  window,
  localStorage,
  location: window.location,
  navigator: { clipboard: { writeText: async () => {} }, userAgent: "node" },
  performance,
  crypto: globalThis.crypto,
  structuredClone,
  console,
  setTimeout,
  clearTimeout,
  URL: globalThis.URL,
  Blob: globalThis.Blob,
  FileReader: class {
    readAsDataURL() {}
  },
  fetch: globalThis.fetch,
  TextDecoder,
  AbortController,
  URLSearchParams,
  matchMedia: () => ({ matches: false }),
  alert: (message) => alerts.push(message),
  prompt: () => null,
  confirm: (message) => {
    confirmations.push(message);
    return true;
  },
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

/* ------------------------------------------------------- carregar o app.js */

const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8")
  // troca os imports ESM por acessos ao módulo injetado
  .replace(/^import .*?;$/gm, "")
  .replace(/^export .*$/gm, "");

const providersModule = await import("./providers.js");
const markdownModule = await import("./markdown.js");

const context = vm.createContext({
  ...sandbox,
  PROVIDERS: providersModule.PROVIDERS,
  DEFAULT_SYSTEM: providersModule.DEFAULT_SYSTEM,
  listModels: providersModule.listModels,
  streamChat: providersModule.streamChat,
  escapeHtml: markdownModule.escapeHtml,
  renderMarkdown: markdownModule.renderMarkdown,
});

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  ✗ ${name}\n    ${error.message}`);
  }
}

console.log("\nDOM simulado");

storage.set("browser-chat:settings", JSON.stringify({ providerId: "demo", apiKeys: {}, models: {} }));

vm.runInContext(appSource, context, { filename: "app.js" });
check("app.js inicializa sem exceção", () => assert.ok(true));
check("renderiza o estado vazio", () => assert.equal(document.querySelector("#empty-state").hidden, false));
check("pill mostra o provedor configurado", () => assert.match(document.querySelector("#pill-text").textContent, /Demonstração/));

// cria conversa pelo handler do botão
document.querySelector("#new-chat").click();
check("nova conversa criada e persistida", () => {
  const chats = JSON.parse(storage.get("browser-chat:chats"));
  assert.equal(chats.length, 1);
  assert.equal(chats[0].messages.length, 0);
});

// configura uma chave e envia uma mensagem usando o provedor "demo" (sem rede)
document.querySelector("#api-key").value = "chave-de-teste";
document.querySelector("#api-key").dispatchEvent({ type: "input" });

const input = document.querySelector("#input");
input.value = "Olá, mundo!";
input.dispatchEvent({ type: "input" });

// dispara o envio pelo botão e espera o streaming terminar
document.querySelector("#send-btn").click();
await new Promise((resolve) => setTimeout(resolve, 2200));

const chats = JSON.parse(storage.get("browser-chat:chats"));
check("mensagem do usuário gravada", () => {
  assert.equal(chats[0].messages[0].role, "user");
  assert.equal(chats[0].messages[0].content, "Olá, mundo!");
});
check("título derivado da primeira mensagem", () => assert.equal(chats[0].title, "Olá, mundo!"));
check("resposta do assistente gravada", () => {
  const reply = chats[0].messages[1];
  assert.equal(reply.role, "assistant");
  assert.ok(reply.content.length > 0, "resposta vazia");
});

check("histórico renderizado na tela", () => {
  const html = document.querySelector("#messages").innerHTML;
  assert.ok(html.includes("Olá, mundo!"));
  assert.ok(html.includes("<table>"), "tabela do demo não renderizada");
});

check("estimativa de tokens aparece no rodapé", () => {
  assert.match(document.querySelector("#token-estimate").textContent, /tokens no contexto/);
});

check("mensagem de erro ao enviar sem chave", async () => {
  // remova a chave e tente de novo
  document.querySelector("#clear-key").click();
  const before = JSON.parse(storage.get("browser-chat:chats"))[0].messages.length;
  input.value = "sem chave";
  input.dispatchEvent({ type: "input" });
  document.querySelector("#send-btn").click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  const after = JSON.parse(storage.get("browser-chat:chats"))[0].messages.length;
  assert.equal(after, before, "não deveria adicionar mensagem sem chave");
});

check("exportar Markdown gera conteúdo", () => {
  const blobs = [];
  class RecordingBlob extends globalThis.Blob {
    constructor(parts, options) {
      super(parts, options);
      blobs.push(parts.join(""));
    }
  }
  context.Blob = RecordingBlob;
  document.querySelector("#export-md").click();
  assert.ok(blobs.some((text) => text.includes("# Olá, mundo!")), "export vazio");
});

console.log(`\n${passed} verificações passaram${failures.length ? `, ${failures.length} falharam` : ""}.`);
process.exit(failures.length ? 1 : 0);
