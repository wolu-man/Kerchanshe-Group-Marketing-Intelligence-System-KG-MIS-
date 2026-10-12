import type { Metadata } from 'next';
import { HelpShell } from '@/components/help/HelpShell';

export const metadata: Metadata = {
  title: 'Help Center | KG-MIS',
  description:
    'KG-MIS Help Center — module-by-module guides, step-by-step instructions, role restrictions, FAQs and troubleshooting for every screen.',
  robots: { index: false, follow: true },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <HelpShell>{children}</HelpShell>;
}
