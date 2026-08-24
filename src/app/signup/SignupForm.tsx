'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ArrowRight, UserPlus } from 'lucide-react';

export default function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sign up failed');
      router.replace('/dashboard/instances');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="login-icon"><UserPlus size={22} /></div>
      <p className="login-kicker">WhatsApp AI Gateway</p>
      <h1>Create your account</h1>
      <p className="login-copy">Sign up to manage instances, QR pairing, webhooks, and delivery health.</p>

      <label htmlFor="signup-name">Name</label>
      <input
        id="signup-name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Your name"
        minLength={2}
        required
        autoFocus
      />

      <label htmlFor="signup-email">Email</label>
      <input
        id="signup-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        required
      />

      <label htmlFor="dashboard-password">Password</label>
      <input
        id="signup-password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="At least 10 characters"
        minLength={10}
        required
      />

      {error && <p className="login-error" role="alert">{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? 'Creating account...' : 'Create account'}
        {!loading && <ArrowRight size={17} />}
      </button>

      <p className="login-switch">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
