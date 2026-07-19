import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isHackathonPublicHeaders } from '@/lib/security/hackathon-public-mode';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  if (isHackathonPublicHeaders(await headers())) {
    redirect('/dashboard/instances');
  }

  return (
    <main className="login-shell">
      <Suspense fallback={<div className="login-card">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
