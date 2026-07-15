import katex from "katex";
import { marked } from "marked";

export const markdownCss = `
  :root { color-scheme: light dark; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 16px; line-height: 1.7; color: var(--text); background: transparent; word-break: break-word; }
  h1, h2, h3 { line-height: 1.35; margin: 1.35em 0 .55em; }
  h1 { font-size: 1.55em; } h2 { font-size: 1.3em; } h3 { font-size: 1.12em; }
  p { margin: 0 0 .8em; } ul, ol { padding-left: 1.4em; margin: .45em 0 .85em; }
  blockquote { margin: .9em 0; padding: .1em 1em; border-left: 3px solid #6e8b5c; color: #71806d; }
  pre { overflow-x: auto; padding: .85em; border-radius: 8px; background: #e8ece4; }
  code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .88em; background: #e8ece4; border-radius: 4px; padding: .12em .28em; }
  pre code { padding: 0; background: transparent; } table { width: 100%; border-collapse: collapse; margin: .9em 0; font-size: .9em; }
  th, td { border: 1px solid #cfd6ca; padding: .45em; text-align: left; } th { background: #e8ece4; }
  img { max-width: 100%; height: auto; } a { color: #557a42; } hr { border: 0; border-top: 1px solid #d9dfd4; margin: 1.4em 0; }
  .math-block { overflow-x: auto; text-align: center; margin: 1em 0; padding: .3em 0; }
  .math-inline { display: inline-block; vertical-align: middle; }
  @media (prefers-color-scheme: dark) { body { color: #edf2e9; } blockquote { color: #b9c5b4; } pre, code, th { background: #263126; } th, td { border-color: #4a5748; } a { color: #9bc784; } }
`;

function renderFormula(formula: string, displayMode: boolean) {
  try {
    return katex.renderToString(formula.trim(), { displayMode, output: "mathml", throwOnError: false });
  } catch {
    return formula;
  }
}

function renderMath(markdown: string) {
  // Keep fenced and inline code literal; formula markers inside code must not render.
  return markdown.split(/(```[\s\S]*?```|`[^`]*`)/g).map((part, index) => {
    if (index % 2 === 1) return part;
    return part
      .replace(/\$\$([\s\S]+?)\$\$/g, (_match, formula) => `\n\n<div class="math-block">${renderFormula(formula, true)}</div>\n\n`)
      .replace(/(^|[^\\])\$([^\n$]+?)\$/g, (_match, prefix, formula) => `${prefix}<span class="math-inline">${renderFormula(formula, false)}</span>`);
  }).join("");
}

export function renderMarkdownBody(markdown: string) {
  return marked.parse(renderMath(markdown), { gfm: true, breaks: false }) as string;
}

export function renderMarkdownHtml(markdown: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><style>${markdownCss}</style></head><body>${renderMarkdownBody(markdown)}</body></html>`;
}
