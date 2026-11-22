/**
 * Renders the safe Markdown subset (packages/shared markdown.ts, ADR-021) as React elements.
 * There is no HTML path: text nodes are React text (escaped), links only exist for the URLs the
 * parser accepted, and they open in a new tab without access to this page.
 */
import { parseMarkdown, type MdInline } from '@nookscanner/shared';
import { Fragment, type ReactNode } from 'react';

function Inline({ nodes }: { nodes: MdInline[] }): ReactNode {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text':
        return <Fragment key={i}>{n.text}</Fragment>;
      case 'br':
        return <br key={i} />;
      case 'strong':
        return (
          <strong key={i}>
            <Inline nodes={n.children} />
          </strong>
        );
      case 'em':
        return (
          <em key={i}>
            <Inline nodes={n.children} />
          </em>
        );
      case 'link':
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow">
            <Inline nodes={n.children} />
          </a>
        );
    }
  });
}

/** A block of instruction text; `inline` renders a single step without paragraph margins. */
export function Markdown({ source, inline = false }: { source: string; inline?: boolean }) {
  const blocks = parseMarkdown(source);
  if (inline && blocks.length === 1 && blocks[0]!.type === 'p') {
    return <Inline nodes={blocks[0]!.children} />;
  }
  return (
    <>
      {blocks.map((b, i) =>
        b.type === 'p' ? (
          <p key={i}>
            <Inline nodes={b.children} />
          </p>
        ) : b.type === 'ul' ? (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Inline nodes={item} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Inline nodes={item} />
              </li>
            ))}
          </ol>
        ),
      )}
    </>
  );
}
