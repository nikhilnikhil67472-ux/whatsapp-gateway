import { db } from '@/lib/db';
import { getServerDashboardSession } from '@/lib/security/dashboard-server';
import AutomationWorkspace from './AutomationWorkspace';

export const dynamic = 'force-dynamic';

export default async function AutomationsPage() {
  const session = await getServerDashboardSession();
  const instances = db.listInstances(session.organizationId).map((instance: any) => ({
    id: instance.id,
    name: instance.instance_name,
    status: instance.status,
  }));
  return <AutomationWorkspace instances={instances} />;
}
