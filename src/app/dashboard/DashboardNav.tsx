'use client';

import Link from 'next/link';
import {
  Activity,
  BookOpen,
  ContactRound,
  KeyRound,
  List,
  LogOut,
  Settings,
  Users,
  Workflow,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { DashboardRole } from '@/lib/security/dashboard-auth';

const sections: Array<{
  label: string;
  items: Array<{
    href: string;
    label: string;
    icon: typeof Activity;
    adminOnly?: boolean;
  }>;
}> = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard/instances', label: 'Instances', icon: List },
      { href: '/dashboard/crm', label: 'Contacts', icon: ContactRound },
      { href: '/dashboard/automations', label: 'Automations', icon: Workflow },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/dashboard/health', label: 'Health', icon: Activity },
      { href: '/dashboard/usage', label: 'Usage & audit', icon: KeyRound },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/dashboard/team', label: 'Team & API keys', icon: Users, adminOnly: true },
      { href: '/dashboard/settings', label: 'Global config', icon: Settings, adminOnly: true },
    ],
  },
];

export default function DashboardNav({
  role,
  userName,
  userEmail,
}: {
  role: DashboardRole;
  userName: string;
  userEmail: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const activeItem = nav?.querySelector<HTMLElement>('.nav-item.active');
    if (!nav || !activeItem || nav.scrollWidth <= nav.clientWidth) return;

    nav.scrollTo({
      left: Math.max(0, activeItem.offsetLeft - (nav.clientWidth - activeItem.offsetWidth) / 2),
      behavior: 'auto',
    });
  }, [pathname]);

  return (
    <>
      <nav className="sidebar-nav" ref={navRef}>
        {sections.map((section) => (
          <div className="nav-section" key={section.label}>
            <span className="nav-section-label">{section.label}</span>
            {section.items
              .filter((item) => !item.adminOnly || role === 'admin')
              .map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item${active ? ' active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
          </div>
        ))}
        <div className="nav-section">
          <span className="nav-section-label">Developers</span>
          <Link href="/docs" className="nav-item">
            <BookOpen size={18} />
            API documentation
          </Link>
        </div>
      </nav>
      <div className="sidebar-account">
        <div className="account-avatar">{userName.slice(0, 1).toUpperCase()}</div>
        <div className="account-copy">
          <strong>{userName}</strong>
          <span>{userEmail || role}</span>
          <small>{role}</small>
        </div>
        <button
          type="button"
          className="sidebar-logout"
          aria-label="Sign out"
          title="Sign out"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.replace('/login');
            router.refresh();
          }}
        >
          <LogOut size={18} />
        </button>
      </div>
    </>
  );
}
