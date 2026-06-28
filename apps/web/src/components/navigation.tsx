'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const links = [
  { href: '/tasks', label: 'Tasks' },
  { href: '/repos', label: 'Repos' },
  { href: '/settings', label: 'Settings' },
];

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-4">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            'text-sm transition-colors hover:text-slate-100',
            pathname.startsWith(l.href) ? 'text-slate-100 font-medium' : 'text-slate-400',
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
