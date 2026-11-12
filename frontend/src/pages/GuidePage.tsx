import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import GithubSlugger from 'github-slugger';
import { List } from 'lucide-react';
// The guide lives in docs/ so it reads well on GitHub too; the page renders that same file.
import guide from '../../../docs/USER_GUIDE.md?raw';

interface TocItem { depth: 1 | 2; text: string; id: string }

/** Headings for the "On this page" list, slugged exactly like rehype-slug does for the rendered page. */
function buildToc(md: string): TocItem[] {
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];
  let inFence = false;
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence;
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const text = m[2].replace(/\*\*|__|`/g, '');
    const id = slugger.slug(text);
    const depth = m[1].length;
    if (depth === 1 || depth === 2) items.push({ depth, text, id });
  }
  return items.slice(1); // skip the document title
}

function TocLinks({ items }: { items: TocItem[] }) {
  return (
    <ul className="space-y-0.5 text-sm">
      {items.map((t) => (
        <li key={t.id}>
          <a
            href={`#${t.id}`}
            className={t.depth === 1 ? 'mt-3 block font-semibold text-ink hover:text-primary' : 'block py-0.5 pl-3 text-ink-2 hover:text-primary'}
          >
            {t.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

const components: Components = {
  a: ({ href, children }) =>
    href?.startsWith('#') ? <a href={href}>{children}</a> : <a href={href} target="_blank" rel="noreferrer">{children}</a>,
  table: ({ children }) => (
    <div className="guide-table">
      <table>{children}</table>
    </div>
  ),
};

export function GuidePage() {
  const toc = useMemo(() => buildToc(guide), []);
  const { hash } = useLocation();

  // Deep links such as /guide#6-run-tests-automatically-with-schedules
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_15rem] xl:gap-8">
      <article className="card min-w-0 px-5 py-6 sm:px-8 sm:py-8">
        <details className="mb-6 rounded-lg border border-line bg-surface-2 px-4 py-3 xl:hidden">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink"><List className="h-4 w-4" /> Contents</summary>
          <div className="mt-2 max-h-80 overflow-y-auto"><TocLinks items={toc} /></div>
        </details>
        <div className="guide" data-testid="user-guide">
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
            {guide}
          </Markdown>
        </div>
      </article>
      <aside className="hidden xl:block">
        <nav aria-label="On this page" className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto pb-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">On this page</div>
          <TocLinks items={toc} />
        </nav>
      </aside>
    </div>
  );
}
