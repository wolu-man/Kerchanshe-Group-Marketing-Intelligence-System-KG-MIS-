import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'KG-MIS Development Team & Contributors | Kerchanshe Group',
  description:
    'Meet the KG-MIS development team — technology leadership, software engineering, business intelligence, marketing research, and enterprise application integration.',
  openGraph: {
    title: 'KG-MIS — Development Team & Contributors',
    description:
      'A collaborative initiative combining technology leadership, software engineering, business intelligence, marketing research, and enterprise integration.',
    type: 'website',
    locale: 'en_ET',
    siteName: 'Kerchanshe Group MIS',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KG-MIS Development Team & Contributors',
    description:
      'Technology leadership, software engineering, business research, and enterprise integration behind KG-MIS.',
  },
  robots: { index: true, follow: true },
};

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
