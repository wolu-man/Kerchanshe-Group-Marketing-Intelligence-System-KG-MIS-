import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KG-MIS - Market Intelligence System',
  description: 'Hybrid Market Intelligence System for Kerchanshe Group',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
