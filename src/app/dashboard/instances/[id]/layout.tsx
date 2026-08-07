import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getServerDashboardSession } from '@/lib/security/dashboard-server';
import InstanceNav from './InstanceNav';

export const dynamic = 'force-dynamic';

export default async function InstanceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerDashboardSession();
  const instance = db.getInstanceByIdentifier(id, session.organizationId) || db.getInstanceByIdentifier(id);
  if (!instance) notFound();

  return (
    <>
      <InstanceNav
        id={id}
        name={instance.instance_name}
        status={instance.status}
        role={session.role}
      />
      {children}
    </>
  );
}
