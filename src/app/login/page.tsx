import { Suspense } from 'react';
import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <main className="login-shell">
      <Suspense fallback={<div className="login-card">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
