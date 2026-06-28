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
      <body className="min-h-screen bg-black text-slate-100">
        <header className="h-[46px] border-b border-[#141a22] bg-black px-3 sm:px-5">
          <div className="flex h-full items-center justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:gap-6">
              <div className="flex items-center gap-3">
                <span className="grid size-4 grid-cols-2 gap-1" aria-hidden="true">
                  <span className="rounded-[1px] bg-[#60a5fa]" />
                  <span className="rounded-[1px] bg-[#22c55e]" />
                  <span className="rounded-[1px] bg-[#a78bfa]" />
                  <span className="rounded-[1px] bg-[#34d399]" />
                </span>
                <span className="hidden text-[15px] font-bold leading-none text-slate-100 sm:inline">Foreman</span>
              </div>
              <Navigation />
            </div>
            <div className="hidden items-center gap-3 text-xs text-slate-400 md:flex">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
                Connected
              </span>
              <span className="h-4 w-px bg-slate-700" />
              <span className="grid size-7 place-items-center rounded-full bg-indigo-500 text-xs font-semibold text-white">
                F
              </span>
            </div>
          </div>
        </header>
        <main className="min-h-[calc(100vh-46px)] overflow-x-hidden bg-black">{children}</main>
      </body>
    </html>
  );
}
