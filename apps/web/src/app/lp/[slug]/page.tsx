import { notFound } from 'next/navigation';
import { HighConversionTemplate } from '@/components/lp/templates/HighConversionTemplate';
import { LPTracker } from '@/components/lp/LPTracker';
import localFont from 'next/font/local';
import { Metadata } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function fetchPage(slug: string) {
  try {
    const res = await fetch(`${API_URL}/landing-pages/public/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await fetchPage(slug);
  if (!page) return { title: 'Página não encontrada' };
  const content = page.content as { hero?: { title?: string; subtitle?: string } };
  return {
    title: content.hero?.title || page.title,
    description: content.hero?.subtitle || 'Advocacia Especializada',
    robots: { index: true, follow: true },
  };
}

const neueMontreal = localFont({
  src: [
    { path: '../../../../public/fonts/NeueMontreal-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../../../../public/fonts/NeueMontreal-Medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-neue-montreal',
  display: 'swap',
});

export default async function LandingPageSlug({ params }: PageProps) {
  const { slug } = await params;
  const page = await fetchPage(slug);

  if (!page) notFound();

  return (
    <div className={`${neueMontreal.variable} font-sans`}>
      <LPTracker pageId={page.id} />
      <HighConversionTemplate
        pageId={page.id}
        content={page.content}
        whatsappNumber={page.whatsapp_number}
      />
    </div>
  );
}
