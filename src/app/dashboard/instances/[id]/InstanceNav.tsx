'use client';

import Link from 'next/link';
import { Activity, LayoutDashboard, MessageSquareText, QrCode, Settings } from 'lucide-react';
import { usePathname } from 'next/navigation';

export default function InstanceNav({ id, name, status }: { id: string; name: string; status: string }) {
  const pathname = usePathname();
  const base = `/dashboard/instances/${id}`;
  const items = [
    { href: base, label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: `${base}/qr`, label: 'Pairing', icon: QrCode },
    { href: `${base}/conversations`, label: 'Conversations', icon: MessageSquareText },
    { href: `${base}/logs`, label: 'Activity', icon: Activity },
    { href: `${base}/settings`, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="instance-bar">
      <div className="instance-bar-inner">
        <div className="instance-context">
          <strong>{name}</strong>
          <span className={`status-dot status-${status}`} aria-hidden="true" />
          <span>{status.replaceAll('_', ' ')}</span>
        </div>
        <nav className="instance-tabs" aria-label="Instance navigation">
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
