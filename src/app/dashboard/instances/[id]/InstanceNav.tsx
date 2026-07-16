'use client';

import Link from 'next/link';
import {
  Activity,
  LayoutDashboard,
  MessageSquareText,
  Radio,
  Send,
  Settings,
  Webhook,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { DashboardRole } from '@/lib/security/dashboard-auth';

export default function InstanceNav({
  id,
  name,
  status,
  role,
}: {
  id: string;
  name: string;
  status: string;
  role: DashboardRole;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const base = `/dashboard/instances/${id}`;
  const items = [
    { href: base, label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: `${base}/qr`, label: 'Pairing', icon: Radio },
    { href: `${base}/live`, label: 'Live', icon: Send },
    { href: `${base}/conversations`, label: 'Inbox', icon: MessageSquareText },
    { href: `${base}/webhooks`, label: 'Webhooks', icon: Webhook },
    { href: `${base}/logs`, label: 'Activity', icon: Activity },
    { href: `${base}/settings`, label: 'Settings', icon: Settings, developerOnly: true },
  ].filter((item) => !item.developerOnly || role !== 'viewer');

  useEffect(() => {
    const nav = navRef.current;
    const activeItem = nav?.querySelector<HTMLElement>('a.active');
    if (!nav || !activeItem || nav.scrollWidth <= nav.clientWidth) return;

    nav.scrollTo({
      left: Math.max(0, activeItem.offsetLeft - (nav.clientWidth - activeItem.offsetWidth) / 2),
      behavior: 'auto',
    });
  }, [pathname]);

  return (
    <div className="instance-bar">
      <div className="instance-bar-inner">
        <div className="instance-context">
          <strong>{name}</strong>
          <span className={`status-dot status-${status}`} aria-hidden="true" />
          <span>{status.replaceAll('_', ' ')}</span>
        </div>
        <nav className="instance-tabs" aria-label="Instance navigation" ref={navRef}>
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? 'active' : ''}>
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
