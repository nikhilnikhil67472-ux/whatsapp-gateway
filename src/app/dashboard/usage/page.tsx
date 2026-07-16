import { getServerDashboardSession } from '@/lib/security/dashboard-server';
import UsageWorkspace from './UsageWorkspace';

export const dynamic = 'force-dynamic';

export default async function UsagePage() {
  const session = await getServerDashboardSession();
  return <UsageWorkspace role={session.role} />;
}
