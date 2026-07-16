'use client';

import Link from 'next/link';
import { Activity, List, LogOut, Settings } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

const items = [
  { href: '/dashboard/instances', label: 'Instances', icon: List },
  { href: '/dashboard/health', label: 'Health', icon: Activity },
  { href: '/dashboard/settings', label: 'Global Config', icon: Settings },
];

export default function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <>
      <nav className="sidebar-nav">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={19} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        className="sidebar-logout"
        onClick={async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          router.replace('/login');
          router.refresh();
        }}
      >
        <LogOut size={18} />
        Sign out
      </button>
    </>
  );
}
