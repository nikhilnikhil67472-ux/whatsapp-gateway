import Link from 'next/link';
import { Bot, CheckCircle2, MessageSquare, QrCode, Settings, TestTube2, XCircle } from 'lucide-react';
import { db } from '@/lib/db/sqlite';
import { getServerDashboardSession } from '@/lib/security/dashboard-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function Step({ done, title, detail, href, action }: { done: boolean; title: string; detail: string; href: string; action: string }) {
  return (
    <div className={`setup-step ${done ? 'done' : ''}`}>
      <div className="setup-step-icon">{done ? <CheckCircle2 size={18} /> : <XCircle size={18} />}</div>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <Link className="btn btn-secondary btn-small" href={href}>{action}</Link>
    </div>
  );
}

export default async function InstanceOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerDashboardSession();
  const instance = db.getInstance(id, session.organizationId);
  if (!instance) return <div>Instance not found</div>;

  const stats = db.getInstanceStats(id);
  const connected = instance.status === 'connected';
  const hasWebhook = Boolean(instance.n8n_webhook_url);
  const aiEnabled = instance.ai_enabled !== false;
  const hasMessages = stats.messages > 0;
  const completed = [connected, hasWebhook, aiEnabled, hasMessages].filter(Boolean).length;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-kicker">Instance Home</p>
          <h1 className="page-title">{instance.instance_name}</h1>
          <p className="page-subtitle">
            Simple control room for WhatsApp connection, AI readiness, test messages, and daily operations.
          </p>
        </div>
        <div className="actions-row">
          <Link href={`/dashboard/instances/${id}/qr`} className="btn btn-secondary"><QrCode size={16} /> QR</Link>
          <Link href={`/dashboard/instances/${id}/settings`} className="btn"><Settings size={16} /> Settings</Link>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>WhatsApp</span>
          <strong className={connected ? 'metric-ok' : 'metric-warn'}>{connected ? 'Online' : instance.status.replace('_', ' ')}</strong>
        </div>
        <div className="metric-card">
          <span>AI Agent</span>
          <strong className={aiEnabled ? 'metric-ok' : 'metric-warn'}>{aiEnabled ? 'Enabled' : 'Off'}</strong>
        </div>
        <div className="metric-card">
          <span>Chats</span>
          <strong>{stats.conversations}</strong>
        </div>
        <div className="metric-card">
          <span>Messages</span>
          <strong>{stats.messages}</strong>
        </div>
      </div>

      <div className="overview-grid">
        <div className="card">
          <div className="section-title-row">
            <div>
              <h2>Setup Progress</h2>
              <p>{completed}/4 steps completed. Follow these steps to go live.</p>
            </div>
            <Bot color="var(--primary)" />
          </div>
          <div className="setup-list">
            <Step
              done={connected}
              title="Connect WhatsApp"
              detail={connected ? `Connected as ${instance.phone_number || 'WhatsApp device'}` : 'Scan QR from WhatsApp Linked Devices.'}
              href={`/dashboard/instances/${id}/qr`}
              action={connected ? 'View QR' : 'Scan QR'}
            />
            <Step
              done={hasWebhook}
              title="Add AI Automation Link"
              detail={hasWebhook ? 'Webhook URL is saved.' : 'Paste your n8n webhook URL in settings.'}
              href={`/dashboard/instances/${id}/settings`}
              action="Open"
            />
            <Step
              done={aiEnabled}
              title="Enable AI Replies"
              detail={aiEnabled ? 'AI can reply to incoming messages.' : 'Turn on AI Agent for this instance.'}
              href={`/dashboard/instances/${id}/settings`}
              action="Configure"
            />
            <Step
              done={hasMessages}
              title="Send Test Message"
              detail={hasMessages ? 'Messages have been received.' : 'Send a WhatsApp message to this number to test the full loop.'}
              href={`/dashboard/instances/${id}/conversations`}
              action="View Chats"
            />
          </div>
        </div>

        <div className="card">
          <div className="section-title-row">
            <div>
              <h2>Quick Actions</h2>
              <p>Common tasks for non-technical operators.</p>
            </div>
          </div>
          <div className="quick-action-list">
            <Link href={`/dashboard/instances/${id}/settings#webhook-test`} className="quick-action">
              <TestTube2 size={18} />
              <span>Test AI Webhook</span>
            </Link>
            <Link href={`/dashboard/instances/${id}/conversations`} className="quick-action">
              <MessageSquare size={18} />
              <span>Open Conversations</span>
            </Link>
            <Link href={`/dashboard/instances/${id}/logs`} className="quick-action">
              <Bot size={18} />
              <span>View Activity Logs</span>
            </Link>
          </div>

          <div className="status-summary">
            <h3>Plain English Status</h3>
            <p>
              {connected && hasWebhook && aiEnabled
                ? 'Your WhatsApp AI gateway is ready. Send a message to test the automation.'
                : 'Finish the setup steps on the left. The dashboard will show exactly what is missing.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
