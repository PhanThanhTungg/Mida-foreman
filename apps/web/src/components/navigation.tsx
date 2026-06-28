'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const links = [
  { href: '/tasks', label: 'Tasks' },
  { href: '/workspaces', label: 'Workspaces' },
  { href: '/settings', label: 'Settings' },
];

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            'rounded-md px-2 py-2 text-xs font-medium leading-none transition-colors hover:bg-[#172231] hover:text-slate-100 sm:px-3 sm:text-sm',
            pathname.startsWith(l.href) ? 'bg-[#17304a] text-[#58a6ff]' : 'text-slate-400',
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
