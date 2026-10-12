import Link from 'next/link';
import { Icon } from '@/components/ui';

export interface Crumb {
  label: string;
  href?: string;
}

export function HelpBreadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="help-crumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`}>
            {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            {i < items.length - 1 && <Icon name="chevron-right" className="help-crumbs-sep" />}
          </li>
        ))}
      </ol>
    </nav>
  );
}
