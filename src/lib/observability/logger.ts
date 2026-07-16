import pino from 'pino';

const state = globalThis as typeof globalThis & {
  wagLogger?: pino.Logger;
};

export const logger = state.wagLogger || pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'whatsapp-gateway',
    node_id: process.env.NODE_ID || process.pid,
  },
  redact: {
    paths: [
      'password',
      '*.password',
      'apiKey',
      '*.apiKey',
      'authorization',
      '*.authorization',
      'base64',
      '*.base64',
      'base64_data',
      '*.base64_data',
    ],
    censor: '[REDACTED]',
  },
});

state.wagLogger = logger;

export function errorDetails(error: unknown) {
  return error instanceof Error
    ? { error: error.message, stack: error.stack }
    : { error: String(error) };
}
