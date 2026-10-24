/** Renders the light markup used in lib/legal.ts: **bold** and [label](/in-app-path). */
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\(\/[^)]*\))/g;

export function richText(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\((\/[^)]*)\)$/.exec(part);
    if (link) {
      return (
        <Link key={i} to={link[2]!}>
          {link[1]}
        </Link>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function RichText({ text }: { text: string }) {
  return <>{richText(text)}</>;
}
