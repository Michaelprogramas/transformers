/**
 * Mini renderizador de Markdown, sem dependências.
 *
 * Foi escrito para saída de LLM, então: tolera tabelas, listas aninhadas, blocos de código,
 * citações e links. Tudo é escapado antes de virar HTML — o texto do modelo nunca é injetado
 * como HTML bruto (sem `innerHTML` de conteúdo não confiável), e links só aceitam http(s)/mailto.
 */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** Realce de sintaxe minimalista: strings, números, palavras-chave e comentários.
 *
 * Importante: os tokens são extraídos do código *bruto* e cada pedaço é escapado individualmente.
 * Escapar primeiro e depois aplicar realce acabaria realçando dentro de entidades HTML (`&#39;`).
 */
function highlight(code, lang = "") {
  if (lang === "diff") {
    return code
      .split("\n")
      .map((line) => {
        const cls = line.startsWith("+") ? "tok-str" : line.startsWith("-") ? "tok-kw" : "";
        return cls ? `<span class="${cls}">${escapeHtml(line)}</span>` : escapeHtml(line);
      })
      .join("\n");
  }

  const keywords = new Set(
    ("const let var function return if else for while class new import from export def async await try except finally with as in " +
      "not and or None True False self print raise yield lambda struct impl fn pub use mod match enum interface type extends " +
      "implements public private static void int float string bool true false null undefined this super throw catch switch case " +
      "break continue do elif pass global nonlocal assert del is").split(" "),
  );
  const pattern =
    /(#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_][A-Za-z0-9_]*)\b/g;

  let out = "";
  let last = 0;
  for (const match of code.matchAll(pattern)) {
    out += escapeHtml(code.slice(last, match.index));
    const [full, comment, str, num, word] = match;
    if (comment) out += `<span class="tok-com">${escapeHtml(full)}</span>`;
    else if (str) out += `<span class="tok-str">${escapeHtml(full)}</span>`;
    else if (num) out += `<span class="tok-num">${full}</span>`;
    else if (word && keywords.has(word)) out += `<span class="tok-kw">${word}</span>`;
    else out += escapeHtml(full);
    last = match.index + full.length;
  }
  out += escapeHtml(code.slice(last));
  return out;
}

function safeUrl(url) {
  const trimmed = String(url).trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) return trimmed;
  return "#";
}

/** Formatação inline: código, negrito, itálico, riscado, links e imagens. */
function inline(text) {
  const codeGuards = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codeGuards.push(`<code>${code}</code>`);
    return `\u0001${codeGuards.length - 1}\u0001`;
  });

  out = out
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, src) => {
      const href = safeUrl(src.replace(/&amp;/g, "&"));
      return href === "#" ? alt : `<img src="${escapeHtml(href)}" alt="${alt}" loading="lazy" />`;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
      const url = safeUrl(href.replace(/&amp;/g, "&"));
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    })
    .replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");

  return out.replace(/\u0001(\d+)\u0001/g, (_, i) => codeGuards[Number(i)]);
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

function splitRow(line) {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * Converte Markdown em HTML seguro.
 * @param {string} markdown
 * @returns {string}
 */
export function renderMarkdown(markdown = "") {
  const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // bloco de código com cerca
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/);
    if (fence) {
      const marker = fence[1];
      const lang = (fence[2] || "").toLowerCase();
      const body = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      const code = body.join("\n");
      html.push(
        `<pre><div class="code-head"><span>${escapeHtml(lang || "código")}</span>` +
          `<button type="button" class="copy-code" data-code="${escapeHtml(code).replace(/"/g, "&quot;")}">copiar</button></div>` +
          `<code>${highlight(code, lang)}</code></pre>`,
      );
      continue;
    }

    // regra horizontal
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      html.push("<hr />");
      i += 1;
      continue;
    }

    // título
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 5);
      html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    // tabela
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      html.push(
        "<table><thead><tr>" +
          head.map((cell) => `<th>${inline(cell)}</th>`).join("") +
          "</tr></thead><tbody>" +
          rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("") +
          "</tbody></table>",
      );
      continue;
    }

    // citação
    if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      html.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
      continue;
    }

    // listas (com aninhamento por indentação)
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        const itemLines = [lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, "")];
        const baseIndent = lines[i].match(/^\s*/)[0].length;
        i += 1;
        while (
          i < lines.length &&
          lines[i].trim() &&
          !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
          lines[i].match(/^\s*/)[0].length > baseIndent - 1 &&
          !/^\s*(#{1,6}\s|```|~~~)/.test(lines[i])
        ) {
          itemLines.push(lines[i].trim());
          i += 1;
        }
        items.push(`<li>${inline(itemLines.join(" "))}</li>`);
      }
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    // parágrafo
    if (line.trim()) {
      const paragraph = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^\s*(#{1,6}\s|```|~~~|>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]) &&
        !(lines[i].includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
      ) {
        paragraph.push(lines[i].trim());
        i += 1;
      }
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
      continue;
    }

    i += 1;
  }

  return html.join("\n");
}
