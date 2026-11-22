/**
 * Safe Markdown subset for instructions (Stage 8.3, ADR-021). Managers write plain text with a
 * little formatting; guests see it rendered. The parser never produces HTML: it returns a small
 * tree of text nodes that the apps render as React elements, so anything that looks like HTML
 * (`<script>`, `<img onerror=...>`) stays visible text. Links are only kept for https:, tel: and
 * mailto: addresses; anything else (javascript:, data:, relative URLs) stays text.
 *
 * Supported: paragraphs (blank line), line breaks, `- ` / `* ` bullet lists, `1. ` numbered
 * lists, **bold**, *italic* / _italic_, [text](https://...). Nothing else.
 */

export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: MdInline[] }
  | { type: 'em'; children: MdInline[] }
  | { type: 'link'; href: string; children: MdInline[] }
  | { type: 'br' };

export type MdBlock =
  { type: 'p'; children: MdInline[] } | { type: 'ul' | 'ol'; items: MdInline[][] };

export const MARKDOWN_MAX_LENGTH = 5000;

const SAFE_HREF =
  /^(https:\/\/[^\s<>"'`]+|tel:\+?[0-9][0-9 ()-]{2,24}|mailto:[^\s<>"'`@]+@[^\s<>"'`@]+)$/i;

/** True for the link targets the renderer may turn into links. */
export function safeHref(href: string): boolean {
  // Control characters and whitespace are how scheme filters get bypassed ("java\tscript:").
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(href)) return false;
  return SAFE_HREF.test(href);
}

function inline(src: string, depth = 0): MdInline[] {
  const out: MdInline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    if (depth < 4) {
      const link = /^\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/.exec(rest);
      if (link) {
        if (safeHref(link[2]!)) {
          flush();
          out.push({ type: 'link', href: link[2]!, children: inline(link[1]!, depth + 1) });
        } else {
          // Unsafe target: keep the visible text only.
          text += link[1];
        }
        i += link[0].length;
        continue;
      }
      const strong = /^\*\*([^*\n]+?)\*\*/.exec(rest);
      if (strong) {
        flush();
        out.push({ type: 'strong', children: inline(strong[1]!, depth + 1) });
        i += strong[0].length;
        continue;
      }
      const em = /^(\*|_)([^*_\n]+?)\1/.exec(rest);
      if (em && (i === 0 || /[\s(]/.test(src[i - 1]!))) {
        flush();
        out.push({ type: 'em', children: inline(em[2]!, depth + 1) });
        i += em[0].length;
        continue;
      }
    }
    if (src[i] === '\n') {
      flush();
      out.push({ type: 'br' });
      i += 1;
      continue;
    }
    text += src[i];
    i += 1;
  }
  flush();
  return out;
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/;

/** Parses the supported subset; input longer than the limit is cut (the database refuses it). */
export function parseMarkdown(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const text = source.slice(0, MARKDOWN_MAX_LENGTH).replace(/\r\n?/g, '\n');
  for (const chunk of text.split(/\n\s*\n/)) {
    const lines = chunk.split('\n').filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    if (lines.every((l) => BULLET.test(l))) {
      blocks.push({ type: 'ul', items: lines.map((l) => inline(BULLET.exec(l)![1]!.trim())) });
    } else if (lines.every((l) => NUMBER.test(l))) {
      blocks.push({ type: 'ol', items: lines.map((l) => inline(NUMBER.exec(l)![1]!.trim())) });
    } else {
      blocks.push({ type: 'p', children: inline(lines.map((l) => l.trim()).join('\n')) });
    }
  }
  return blocks;
}

/** Plain text of a parsed document (search, screen-reader summaries, length checks). */
export function markdownText(blocks: MdBlock[]): string {
  const flat = (nodes: MdInline[]): string =>
    nodes
      .map((n) => (n.type === 'text' ? n.text : n.type === 'br' ? '\n' : flat(n.children)))
      .join('');
  return blocks
    .map((b) => (b.type === 'p' ? flat(b.children) : b.items.map(flat).join('\n')))
    .join('\n\n');
}
