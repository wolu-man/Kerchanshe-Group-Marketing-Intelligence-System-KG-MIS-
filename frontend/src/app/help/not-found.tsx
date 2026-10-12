import Link from 'next/link';
import { Icon } from '@/components/ui';
import { HelpBreadcrumbs } from '@/components/help/HelpBreadcrumbs';

export default function HelpNotFound() {
  return (
    <div className="help-home">
      <HelpBreadcrumbs items={[{ label: 'Help Center', href: '/help' }, { label: 'Not found' }]} />
      <div className="empty">
        <div className="icon"><Icon name="book-open" /></div>
        <div>This help article does not exist.</div>
        <div style={{ marginTop: 12 }}>
          <Link href="/help" className="btn btn-primary btn-sm">
            <Icon name="arrow-left" /> Back to Help Center
          </Link>
        </div>
      </div>
    </div>
  );
}
