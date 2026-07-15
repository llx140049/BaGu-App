import katex from "katex";
import { marked } from "marked";

export const markdownCss = `
  :root { color-scheme: light dark; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 16px; line-height: 1.66; color: #171824; background: transparent; word-break: break-word; }
  h1, h2, h3 { line-height: 1.35; margin: 1.45em 0 .6em; }
  h1 { color: #111320; font-size: 1.68em; } h2 { color: #285ec9; font-size: 1.36em; } h3 { color: #285ec9; font-size: 1.14em; }
  p { margin: 0 0 .76em; } ul, ol { padding-left: 1.4em; margin: .45em 0 .78em; }
  blockquote { margin: .9em 0; padding: .1em 1em; border-left: 3px solid #285ec9; color: #63708d; }
  pre { overflow-x: auto; padding: .85em; border-radius: 8px; background: #f2f4f8; }
  code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .88em; background: #f2f4f8; border-radius: 4px; padding: .12em .28em; }
  pre code { padding: 0; background: transparent; } table { width: 100%; border-collapse: collapse; margin: .9em 0; font-size: .9em; }
  th, td { border: 1px solid #dfe3eb; padding: .45em; text-align: left; } th { background: #f2f4f8; }
  .table-scroll, .image-scroll { display: block; max-width: 100%; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: thin; scrollbar-color: #b8c0cf transparent; margin: .9em 0; padding-bottom: 4px; }
  .table-scroll table { width: max-content; min-width: 100%; margin: 0; } .image-scroll img { display: block; max-width: none; height: auto; }
  .table-scroll::-webkit-scrollbar, .image-scroll::-webkit-scrollbar { height: 5px; } .table-scroll::-webkit-scrollbar-thumb, .image-scroll::-webkit-scrollbar-thumb { background: #b8c0cf; border-radius: 999px; }
  img { max-width: 100%; height: auto; } a { color: #285ec9; } hr { border: 0; border-top: 1px solid #e2e5eb; margin: 1.4em 0; }
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
  const html = marked.parse(renderMath(markdown), { gfm: true, breaks: false }) as string;
  return html
    .replace(/<table[\s\S]*?<\/table>/g, (table) => `<div class="table-scroll">${table}</div>`)
    .replace(/<img\b[^>]*>/g, (image) => `<span class="image-scroll">${image}</span>`);
}

export function renderMarkdownHtml(markdown: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><style>${markdownCss}</style></head><body>${renderMarkdownBody(markdown)}</body></html>`;
}
