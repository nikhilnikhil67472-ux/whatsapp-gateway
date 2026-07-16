import * as Sentry from '@sentry/nextjs';

let initialized = false;

export function initWorkerSentry() {
  if (initialized) return;
  initialized = true;
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    enableLogs: true,
  });
  Sentry.setTag('process', 'worker');
  Sentry.setTag('node_id', process.env.NODE_ID || String(process.pid));
}

export function captureWorkerException(error: unknown, context?: Record<string, unknown>) {
  if (context) {
    Sentry.withScope((scope) => {
      scope.setContext('worker', context);
      Sentry.captureException(error);
    });
    return;
  }
  Sentry.captureException(error);
}
