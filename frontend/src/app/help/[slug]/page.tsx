import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HelpArticle } from '@/components/help/HelpArticle';
import { ALL_GUIDES, getGuide } from '@/lib/help';

interface Params {
  params: { slug: string };
}

export function generateStaticParams() {
  return ALL_GUIDES.map((g) => ({ slug: g.slug }));
}

export function generateMetadata({ params }: Params): Metadata {
  const guide = getGuide(params.slug);
  if (!guide) return { title: 'Help article not found | KG-MIS' };
  return {
    title: `${guide.title} | KG-MIS Help Center`,
    description: guide.summary,
    robots: { index: false, follow: true },
  };
}

export default function HelpArticlePage({ params }: Params) {
  const guide = getGuide(params.slug);
  if (!guide) notFound();
  return <HelpArticle guide={guide} />;
}
