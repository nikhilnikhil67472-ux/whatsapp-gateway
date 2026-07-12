import Link from 'next/link';
import { Activity, Bot, Settings, List } from 'lucide-react';
import './dashboard.css'; // We will use plain CSS

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-mark">
            <Bot size={22} />
          </div>
          <div className="brand-copy">
            <h2>AI Gateway</h2>
            <span>WhatsApp automation</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <Link href="/dashboard/instances" className="nav-item">
            <List size={20} />
            Instances
          </Link>
          <Link href="/dashboard/health" className="nav-item">
            <Activity size={20} />
            Health
          </Link>
          <Link href="/dashboard/settings" className="nav-item">
            <Settings size={20} />
            Global Config
          </Link>
        </nav>
        <div className="sidebar-footer">
          Baileys powered local gateway for n8n and custom AI agents.
        </div>
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
