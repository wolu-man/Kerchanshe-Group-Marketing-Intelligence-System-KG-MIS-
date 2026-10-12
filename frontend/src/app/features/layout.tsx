import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'KG-MIS Features | Kerchanshe Group Marketing Intelligence System',
  description:
    'Explore every module in KG-MIS: KPI performance, competitor intelligence, field data capture, NexForm surveys, 13 report types, and enterprise administration.',
  openGraph: {
    title: 'KG-MIS — Every Module, Every Detail',
    description:
      'Six pillars, 30+ modules, 100+ features. Explore the complete KG-MIS capability set.',
    type: 'website',
    locale: 'en_ET',
    siteName: 'Kerchanshe Group MIS',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KG-MIS Features | Marketing Intelligence System',
    description:
      'Six pillars, 30+ modules, 100+ features across field intelligence, analytics, and governance.',
  },
  robots: { index: true, follow: true },
};

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
