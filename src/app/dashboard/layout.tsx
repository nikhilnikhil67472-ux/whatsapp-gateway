import { Bot } from 'lucide-react';
import './dashboard.css'; // We will use plain CSS
import DashboardNav from './DashboardNav';

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
        <DashboardNav />
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
