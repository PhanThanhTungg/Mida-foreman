import type { Metadata } from 'next';
import './globals.css';
import { Navigation } from '@/components/navigation';

export const metadata: Metadata = {
  title: 'Foreman',
  description: 'AI-powered Jira task automation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-slate-100">Foreman</span>
            <Navigation />
          </div>
        </header>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
