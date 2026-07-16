import { notFound } from 'next/navigation';
import { db } from '@/lib/db/sqlite';
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
  const instance = db.getInstance(id);
  if (!instance) notFound();

  return (
    <>
      <InstanceNav id={id} name={instance.instance_name} status={instance.status} />
      {children}
    </>
  );
}
