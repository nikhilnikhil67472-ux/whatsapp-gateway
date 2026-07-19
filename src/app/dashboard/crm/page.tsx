import { db } from '@/lib/db';
import { getServerDashboardSession } from '@/lib/security/dashboard-server';
import CrmWorkspace from './CrmWorkspace';

export const dynamic = 'force-dynamic';

export default async function CrmPage() {
  const session = await getServerDashboardSession();
  return (
    <CrmWorkspace
      initialContacts={db.listContacts(undefined, 500, session.organizationId)}
      instances={db.listInstances(session.organizationId).map((instance: any) => ({
        id: instance.id,
        name: instance.instance_name,
      }))}
      users={db.listUsers(session.organizationId).map((user: any) => ({
        id: user.id,
        name: user.name,
        email: user.email,
      }))}
      initialTags={(db.listTags(session.organizationId) as any[]).map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
      }))}
    />
  );
}
