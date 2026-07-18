import katex from "katex";
import { marked } from "marked";

export function markdownCss(isDark = false) {
  const palette = isDark
    ? { text: "#F2F2F6", heading: "#FFFFFF", accent: "#9B8CE8", quote: "#252630", code: "#252630", border: "#3C3D47", table: "#2E3038", background: "#191A20", scrollbar: "#666875" }
    : { text: "#171824", heading: "#111320", accent: "#285ec9", quote: "#f7f8fa", code: "#f2f4f8", border: "#dfe3eb", table: "#f2f4f8", background: "#FFFFFF", scrollbar: "#b8c0cf" };
  return `
  :root { color-scheme: ${isDark ? "dark" : "light"}; }
  body, body * { font-family: BaguMiSans, sans-serif !important; color: ${palette.text}; } body { margin: 0; font-size: 16px; line-height: 1.66; background: ${palette.background}; word-break: break-word; }
  h1, h2, h3 { line-height: 1.35; margin: 1.45em 0 .6em; }
  h1 { color: ${palette.heading}; font-size: 1.68em; } h2 { color: ${palette.accent}; font-size: 1.36em; } h3 { color: ${palette.accent}; font-size: 1.14em; }
  p { margin: 0 0 .76em; } ul, ol { padding-left: 1.4em; margin: .45em 0 .78em; }
  blockquote { margin: .9em 0; padding: .1em 1em; border-left: 3px solid ${palette.accent}; background: ${palette.quote}; }
  pre { overflow-x: auto; padding: .85em; border-radius: 8px; background: ${palette.code}; color: ${palette.text} !important; }
  code { font-family: inherit !important; font-size: .88em; background: ${palette.code}; color: ${palette.text} !important; border-radius: 4px; padding: .12em .28em; }
  pre code { padding: 0; background: transparent; } table { width: 100%; border-collapse: collapse; margin: .9em 0; font-size: .9em; }
  th, td { border: 1px solid ${palette.border}; padding: .45em; text-align: left; } th { background: ${palette.table}; }
  .table-scroll, .image-scroll { display: block; max-width: 100%; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: thin; scrollbar-color: ${palette.scrollbar} transparent; margin: .9em 0; padding-bottom: 4px; }
  .table-scroll table { width: max-content; min-width: 100%; margin: 0; } .image-scroll img { display: block; max-width: none; height: auto; }
  .table-scroll::-webkit-scrollbar, .image-scroll::-webkit-scrollbar { height: 5px; } .table-scroll::-webkit-scrollbar-thumb, .image-scroll::-webkit-scrollbar-thumb { background: ${palette.scrollbar}; border-radius: 999px; }
  img { max-width: 100%; height: auto; } a { color: ${palette.accent}; } hr { border: 0; border-top: 1px solid ${palette.border}; margin: 1.4em 0; }
  .math-block { overflow-x: auto; text-align: center; margin: 1em 0; padding: .3em 0; }
  .math-inline { display: inline-block; vertical-align: middle; }
`;
}

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

export function renderMarkdownHtml(markdown: string, fontUri = "", isDark = false) {
  const fontFace = fontUri ? `@font-face { font-family: BaguMiSans; src: url('${fontUri}'); }` : "";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><style>${fontFace}${markdownCss(isDark)}</style></head><body>${renderMarkdownBody(markdown)}</body></html>`;
}
