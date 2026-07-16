import { notFound } from 'next/navigation';
import { db } from '@/lib/db/sqlite';
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
  const instance = db.getInstance(id, session.organizationId);
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
