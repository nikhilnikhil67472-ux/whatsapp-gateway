'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="login-shell">
          <section className="login-card">
            <p className="login-kicker">Gateway error</p>
            <h1>Something went wrong</h1>
            <p className="login-copy">
              The error was recorded. Retry the request or return to the dashboard.
            </p>
            <button type="button" onClick={reset}>Retry</button>
          </section>
        </main>
      </body>
    </html>
  );
}
