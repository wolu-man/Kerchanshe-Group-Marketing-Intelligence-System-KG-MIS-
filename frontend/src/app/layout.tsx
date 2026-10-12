import '@fortawesome/fontawesome-free/css/all.min.css';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ToastProvider } from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TourProvider } from '@/components/tour/TourProvider';

export const metadata = {
  title: 'KG-MIS · Kerchanshe Group Marketing Intelligence System',
  description: 'Enterprise marketing intelligence platform for Kerchanshe Group — collect, monitor, analyze, and visualize market and field data.',
  openGraph: {
    title: 'KG-MIS — Kerchanshe Group Marketing Intelligence System',
    description: 'Transform market data into actionable intelligence. Field visits, competitor pricing, KPI performance, dynamic forms, and 13 report types.',
    type: 'website',
    locale: 'en_ET',
    siteName: 'Kerchanshe Group MIS',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KG-MIS — Marketing Intelligence System',
    description: 'Enterprise marketing intelligence for Kerchanshe Group.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('kgmis_theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}`,
          }}
        />
      </head>
      <body>
        <ErrorBoundary>
          <AuthProvider>
            <TourProvider>
              <ToastProvider>{children}</ToastProvider>
            </TourProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
