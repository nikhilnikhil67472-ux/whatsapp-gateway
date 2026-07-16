'use client';

import { FormEvent, useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    searchParams.get('configuration') === 'missing'
      ? 'Server login is not configured yet. Add DASHBOARD_PASSWORD and AUTH_SECRET.'
      : '',
  );
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Login failed');
      router.replace(searchParams.get('next') || '/dashboard/instances');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="login-icon"><LockKeyhole size={22} /></div>
      <p className="login-kicker">WhatsApp AI Gateway</p>
      <h1>Dashboard login</h1>
      <p className="login-copy">Manage instances, QR pairing, webhooks, and delivery health.</p>

      <label htmlFor="dashboard-password">Password</label>
      <input
        id="dashboard-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        autoFocus
      />

      {error && <p className="login-error" role="alert">{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign in'}
        {!loading && <ArrowRight size={17} />}
      </button>
    </form>
  );
}
