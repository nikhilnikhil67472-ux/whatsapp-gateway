import { db } from '@/lib/db';
import { getServerDashboardSession } from '@/lib/security/dashboard-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ConversationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerDashboardSession();
  if (!db.getInstance(id, session.organizationId)) return <div>Instance not found</div>;
  const conversations = db.listConversations(id, 50);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-kicker">Inbox</p>
          <h1 className="page-title">Conversations</h1>
          <p className="page-subtitle">Recent direct chats and group threads for this WhatsApp instance.</p>
        </div>
      </div>
      
      <div className="card table-card">
        <div className="table-toolbar">
          <div>
            <h2>Latest Conversations</h2>
            <p>Showing up to 50 threads ordered by last activity.</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Contact / Group</th>
              <th>Type</th>
              <th>Last Interaction</th>
            </tr>
          </thead>
          <tbody>
            {!conversations || conversations.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <div className="empty-state">
                    <strong>No conversations yet</strong>
                    When messages arrive, active chats will appear here.
                  </div>
                </td>
              </tr>
            ) : conversations.map((conv: any) => (
              <tr key={conv.id}>
                <td>
                  <div className="entity-cell">
                    <div className="entity-avatar">
                      {(conv.display_name || conv.remote_jid || 'C').slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="entity-title">{conv.display_name || conv.remote_jid.split('@')[0]}</div>
                      <div className="entity-subtitle">{conv.remote_jid}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="status-badge connected">
                    {conv.is_group ? 'Group' : 'Direct'}
                  </span>
                </td>
                <td>
                  {conv.last_message_at ? new Date(conv.last_message_at).toLocaleString() : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
