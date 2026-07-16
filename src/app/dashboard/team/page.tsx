import { redirect } from 'next/navigation';
import { db } from '@/lib/db/sqlite';
import { getServerDashboardSession } from '@/lib/security/dashboard-server';
import TeamWorkspace from './TeamWorkspace';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const session = await getServerDashboardSession();
  if (session.role !== 'admin') redirect('/dashboard/instances');
  return (
    <TeamWorkspace
      currentUserId={session.userId}
      initialUsers={db.listUsers(session.organizationId).map((user: any) => {
        const safe = { ...user };
        delete safe.password_hash;
        return safe;
      })}
      initialApiKeys={db.listUserApiKeys(session.organizationId)}
      instances={db.listInstances(session.organizationId).map((instance: any) => ({
        id: instance.id,
        name: instance.instance_name,
      }))}
    />
  );
}
