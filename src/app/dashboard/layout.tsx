import { RadioTower } from 'lucide-react';
import './dashboard.css';
import DashboardNav from './DashboardNav';
import { db } from '@/lib/db';
import { getServerDashboardSession } from '@/lib/security/dashboard-server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerDashboardSession();
  const organization = db.getOrganization(session.organizationId);
  const user = db.getUser(session.userId);

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-mark">
            <RadioTower size={21} />
          </div>
          <div className="brand-copy">
            <h2>Relay Gateway</h2>
            <span>{organization?.name || 'WhatsApp operations'}</span>
          </div>
        </div>
        <DashboardNav
          role={session.role}
          userName={user?.name || session.email || 'Administrator'}
          userEmail={session.email || user?.email || null}
        />
      </aside>
      <main className="main-content" id="main-content">
        {children}
      </main>
    </div>
  );
}
