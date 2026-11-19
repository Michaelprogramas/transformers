/**
 * Testes dos módulos do chat (rodam em Node, sem navegador).
 *
 * Uso: node tests.mjs
 * Cobre: renderização de Markdown seguro, conversão de mensagens por provedor, URL joining,
 * e streaming real contra um servidor mock compatível com OpenAI.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { renderMarkdown } from "./markdown.js";
import {
  PROVIDERS,
  joinUrl,
  listModels,
  streamChat,
  toAnthropicMessages,
  toGeminiContents,
  toOpenAIMessages,
} from "./providers.js";

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  ✗ ${name}\n    ${error.message}`);
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  ✗ ${name}\n    ${error.message}`);
  }
}

/* --------------------------------------------------------------- markdown */

console.log("\nMarkdown");
test("escapa HTML bruto", () => {
  const html = renderMarkdown('<script>alert("x")</script>');
  assert.ok(!html.includes("<script>"), html);
  assert.ok(html.includes("&lt;script&gt;"));
});

test("escape em blocos de código", () => {
  const html = renderMarkdown("```html\n<img src=x onerror=alert(1)>\n```");
  assert.ok(!/<img/.test(html), html);
  assert.ok(html.includes("&lt;img"));
});

test("bloco de código com linguagem e botão copiar", () => {
  const html = renderMarkdown("```python\nprint('oi')\n```");
  assert.match(html, /<pre><div class="code-head"><span>python<\/span>/);
  assert.match(html, /class="copy-code"/);
  assert.match(html, /tok-str/);
});

test("negrito, itálico, código inline e riscado", () => {
  const html = renderMarkdown("**forte** e *ênfase* e `código` e ~~velho~~");
  assert.ok(html.includes("<strong>forte</strong>"));
  assert.ok(html.includes("<em>ênfase</em>"));
  assert.ok(html.includes("<code>código</code>"));
  assert.ok(html.includes("<del>velho</del>"));
});

test("link javascript: é neutralizado", () => {
  const html = renderMarkdown("[clique](javascript:alert(1))");
  assert.ok(!html.includes("javascript:"), html);
});

test("links http continuam com rel seguro", () => {
  const html = renderMarkdown("[site](https://example.com)");
  assert.ok(html.includes('href="https://example.com"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
});

test("tabela", () => {
  const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
  assert.ok(html.includes("<table>"));
  assert.ok(html.includes("<th>a</th>"));
  assert.ok(html.includes("<td>2</td>"));
});

test("listas ordenadas e com marcadores", () => {
  assert.match(renderMarkdown("1. um\n2. dois"), /<ol><li>um<\/li><li>dois<\/li><\/ol>/);
  assert.match(renderMarkdown("- um\n- dois"), /<ul><li>um<\/li><li>dois<\/li><\/ul>/);
});

test("títulos, citação e regra", () => {
  assert.ok(renderMarkdown("## Título").includes("<h3>Título</h3>"));
  assert.ok(renderMarkdown("> citado").includes("<blockquote>"));
  assert.ok(renderMarkdown("---").includes("<hr />"));
});

test("parágrafos separados", () => {
  const html = renderMarkdown("linha um\n\nlinha dois");
  assert.equal((html.match(/<p>/g) || []).length, 2);
});

/* ------------------------------------------------------------- provedores */

console.log("\nProvedores");
test("todos os provedores têm configuração mínima", () => {
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    assert.ok(provider.label, `${id} sem label`);
    assert.ok(provider.style, `${id} sem style`);
    assert.ok("needsKey" in provider || provider.style !== "demo", `${id}`);
  }
});

test("joinUrl não duplica /v1", () => {
  assert.equal(joinUrl("https://api.openai.com/v1", "/chat/completions"), "https://api.openai.com/v1/chat/completions");
  assert.equal(joinUrl("https://api.openai.com/v1/", "/v1/chat/completions"), "https://api.openai.com/v1/chat/completions");
  assert.equal(joinUrl("http://localhost:11434/v1", "/models"), "http://localhost:11434/v1/models");
});

test("mensagens OpenAI incluem system e imagens", () => {
  const messages = toOpenAIMessages("seja breve", [
    { role: "user", content: "olá" },
    { role: "assistant", content: "oi" },
    { role: "user", content: "e isto?", images: [{ dataUrl: "data:image/png;base64,AAAA" }] },
  ]);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].content, "olá");
  assert.equal(messages.at(-1).content[1].type, "image_url");
  assert.ok(messages.at(-1).content[1].image_url.url.startsWith("data:image/png;base64,"));
});

test("mensagens Anthropic usam blocos de imagem", () => {
  const messages = toAnthropicMessages([{ role: "user", content: "veja", images: [{ dataUrl: "data:image/jpeg;base64,BBBB" }] }]);
  assert.equal(messages[0].content[0].type, "image");
  assert.equal(messages[0].content[0].source.media_type, "image/jpeg");
  assert.equal(messages[0].content[1].type, "text");
});

test("conteúdo Gemini usa role model para assistente", () => {
  const contents = toGeminiContents([
    { role: "user", content: "oi" },
    { role: "assistant", content: "olá" },
  ]);
  assert.equal(contents[1].role, "model");
  assert.equal(contents[0].parts[0].text, "oi");
});

/* -------------------------------------------------- streaming contra o mock */

const server = http.createServer((request, response) => {
  if (request.url === "/v1/models") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ id: "modelo-b" }, { id: "modelo-a" }] }));
    return;
  }
  if (request.url === "/v1/chat/completions") {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const payload = JSON.parse(body);
      if (payload.stream) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        for (const piece of ["Olá", ", ", "mundo", "!"]) {
          response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
        }
        response.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 7, completion_tokens: 4 } })}\n\n`);
        response.end("data: [DONE]\n\n");
      } else {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content: "resposta completa" } }], usage: { prompt_tokens: 2, completion_tokens: 3 } }));
      }
    });
    return;
  }
  response.writeHead(500);
  response.end("erro inesperado");
});

const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const baseUrl = `http://127.0.0.1:${port}/v1`;

console.log("\nStreaming (servidor mock)");

await testAsync("streaming SSE entrega o texto completo e o usage", async () => {
  let text = "";
  let usage = null;
  for await (const event of streamChat({
    provider: PROVIDERS.openai,
    apiKey: "teste",
    baseUrl,
    model: "mock",
    system: "s",
    messages: [{ role: "user", content: "oi" }],
    temperature: 0.2,
    maxTokens: 128,
    stream: true,
  })) {
    if (event.type === "text") text += event.text;
    if (event.type === "done") usage = event.usage;
  }
  assert.equal(text, "Olá, mundo!");
  assert.deepEqual(usage, { input: 7, output: 4 });
});

await testAsync("modo não-streaming", async () => {
  let text = "";
  for await (const event of streamChat({
    provider: PROVIDERS.openai,
    apiKey: "teste",
    baseUrl,
    model: "mock",
    system: "",
    messages: [{ role: "user", content: "oi" }],
    temperature: 0,
    maxTokens: 64,
    stream: false,
  })) {
    if (event.type === "text") text += event.text;
  }
  assert.equal(text, "resposta completa");
});

await testAsync("listModels ordena a resposta", async () => {
  const models = await listModels({ provider: PROVIDERS.openai, apiKey: "teste", baseUrl });
  assert.deepEqual(models, ["modelo-a", "modelo-b"]);
});

await testAsync("erro HTTP vira mensagem legível", async () => {
  await assert.rejects(
    (async () => {
      for await (const event of streamChat({
        provider: PROVIDERS.openai,
        apiKey: "teste",
        baseUrl: `http://127.0.0.1:${port}/rota-errada`,
        model: "mock",
        system: "",
        messages: [{ role: "user", content: "oi" }],
        temperature: 0,
        maxTokens: 8,
        stream: true,
      })) {
        void event;
      }
    })(),
    /HTTP 500/,
  );
});

await testAsync("modo demonstração não usa rede", async () => {
  let text = "";
  for await (const event of streamChat({
    provider: PROVIDERS.demo,
    apiKey: "",
    baseUrl: "",
    model: "demo-local",
    system: "",
    messages: [{ role: "user", content: "oi tudo bem?" }],
    temperature: 0,
    maxTokens: 10,
    stream: true,
  })) {
    if (event.type === "text") text += event.text;
  }
  assert.ok(text.includes("Demonstração"));
  assert.ok(text.includes("3 palavras"));
});

await testAsync("abort interrompe o streaming", async () => {
  const controller = new AbortController();
  const events = [];
  const iterator = (async () => {
    for await (const event of streamChat({
      provider: PROVIDERS.openai,
      apiKey: "teste",
      baseUrl,
      model: "mock",
      system: "",
      messages: [{ role: "user", content: "oi" }],
      temperature: 0,
      maxTokens: 8,
      stream: true,
      signal: controller.signal,
    })) {
      events.push(event);
      controller.abort();
    }
  })();
  await iterator;
  assert.ok(events.length <= 3, `recebeu ${events.length} eventos`);
});

server.close();

console.log(`\n${passed} testes passaram${failures.length ? `, ${failures.length} falharam` : ""}.`);
process.exit(failures.length ? 1 : 0);
