# Chat Local — chatbot de IA no navegador, com a sua chave de API

Um chat completo que roda **100% no navegador**: HTML + CSS + JavaScript puro, sem backend, sem bundler, sem
dependências. As suas chaves ficam no `localStorage` e as chamadas vão **direto do navegador para o provedor** que
você escolher.

## Recursos

- **Provedores**: OpenAI, Anthropic, OpenRouter, Google Gemini, Groq, Mistral, DeepSeek, Ollama (local),
  qualquer endpoint compatível com OpenAI (LiteLLM, vLLM, LM Studio, Together, Fireworks…), e um modo
  **Demonstração** offline para conhecer a interface.
- **Chaves por provedor**, salvas localmente, com campo mascarado, teste de conexão e remoção individual.
- **Streaming token a token** (SSE), com botão de parar (`Esc`), e fallback automático para resposta completa.
- **Histórico de conversas** com busca, título automático, renomear (duplo clique) e exclusão.
- **Markdown seguro**: títulos, listas, tabelas, citações, blocos de código com realce e botão copiar.
  Todo texto é escapado — links `javascript:` são neutralizados.
- **Imagens**: anexe por botão, colar (`Ctrl+V`) ou arrastar. Enviadas como *data URL* para modelos multimodais.
- **Controles**: temperatura, máximo de tokens, streaming on/off, prompt de sistema.
- **Exportar**: conversa em Markdown/JSON; backup completo (conversas + configurações) e importação.
- **Tema** claro/escuro, atalhos de teclado, layout de desktop com sidebar e responsivo em telas pequenas.

## Como abrir

### Opção 1 — servidor local (recomendado)

```bash
cd examples/browser-chat
python3 -m http.server 8000
```

Abra <http://localhost:8000>. Qualquer servidor estático serve (`npx serve .`, `php -S localhost:8000`…).

> Abrir o `index.html` direto pelo `file://` funciona na maioria dos navegadores, mas módulos ES e CORS podem falhar.
> Prefira um servidor.

### Opção 2 — hospedar de graça

A pasta é estática: publique no GitHub Pages, Cloudflare Pages, Netlify ou Vercel sem configuração. **Use HTTPS** —
chaves trafegando em HTTP são visíveis na rede.

## Configurar a chave

1. Clique em **Configurações** (`Ctrl+,`).
2. Escolha o provedor e cole a chave. Cada um tem um link direto de onde obter.
3. Escolha o modelo (ou clique em **buscar** para listar os disponíveis na sua conta).
4. Clique em **Testar conexão** — se aparecer `ok em N ms`, está pronto.

| Provedor | Endpoint padrão | Chave em |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | platform.openai.com/api-keys |
| Anthropic | `https://api.anthropic.com/v1` | console.anthropic.com/settings/keys |
| OpenRouter | `https://openrouter.ai/api/v1` | openrouter.ai/keys |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` | aistudio.google.com/apikey |
| Groq | `https://api.groq.com/openai/v1` | console.groq.com/keys |
| Mistral | `https://api.mistral.ai/v1` | console.mistral.ai/api-keys |
| DeepSeek | `https://api.deepseek.com/v1` | platform.deepseek.com/api_keys |
| Ollama | `http://localhost:11434/v1` | não precisa |

### Ollama no navegador

O Ollama bloqueia chamadas de páginas web por padrão. Libere a origem onde o chat está rodando:

```bash
OLLAMA_ORIGINS="http://localhost:8000" ollama serve
```

Depois use o provedor **Ollama (local)** e um modelo já baixado (`ollama pull llama3.2`).

## Segurança e privacidade

- As chaves e as conversas ficam no `localStorage` daquele navegador/perfil. Não há servidor intermediário.
- **Qualquer XSS na página leria as chaves.** O renderizador de Markdown escapa todo o HTML e só permite links
  `http(s)`/`mailto` — por isso ele não usa `innerHTML` com conteúdo do modelo.
- Em computador compartilhado, use **Configurações → Apagar tudo** ao terminar.
- A chave da Anthropic exige o header `anthropic-dangerous-direct-browser-access`, que o app envia
  automaticamente; é o caminho oficial para chamadas diretas do navegador.
- Prefira chaves com escopo/limite de gasto e revogue-as se suspeitar de vazamento.

## Testes

```bash
node tests.mjs      # 21 testes: markdown seguro, conversões por provedor, streaming contra um servidor mock
node tests-dom.mjs  # 11 verificações: app.js rodando com um DOM simulado (sem navegador)
```

Os testes não precisam de rede nem de chave: o streaming é validado contra um servidor HTTP local que emite SSE.

## Estrutura

```
index.html   # marcação, diálogos de configurações/ajuda, ícones SVG inline
styles.css   # tema escuro/claro, layout, componentes
app.js       # estado, localStorage, renderização, streaming, atalhos
providers.js # provedores, conversão de mensagens (OpenAI/Anthropic/Gemini), streaming unificado
markdown.js  # Markdown → HTML seguro, com realce de código
tests.mjs / tests-dom.mjs
```

## Limitações conhecidas

- Alguns provedores/endpoints próprios não enviam cabeçalhos CORS; nesse caso o navegador bloqueia a chamada
  (o “Testar conexão” mostra o erro). Use um provedor com CORS liberado ou um proxy compatível.
- Não há sincronização entre dispositivos: use **Exportar tudo / Importar backup** para migrar.
- A contagem de tokens no rodapé é uma estimativa (~4 caracteres por token); o uso real aparece na mensagem
  quando o provedor devolve `usage`.
