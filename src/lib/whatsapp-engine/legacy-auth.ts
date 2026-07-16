import type { SignalDataTypeMap } from '@whiskeysockets/baileys';

const legacyAuthKeyTypes = [
  'app-state-sync-version',
  'app-state-sync-key',
  'sender-key-memory',
  'identity-key',
  'lid-mapping',
  'device-list',
  'sender-key',
  'pre-key',
  'session',
  'tctoken',
] as const satisfies readonly (keyof SignalDataTypeMap)[];

export function legacyAuthFileName(
  keyType: keyof SignalDataTypeMap,
  keyId: string,
) {
  return `${keyType}-${keyId}.json`
    .replace(/\//g, '__')
    .replace(/:/g, '-');
}

export function parseLegacyAuthKeyFile(fileName: string): {
  keyType: keyof SignalDataTypeMap;
  keyId: string;
} | null {
  if (!fileName.endsWith('.json') || fileName === 'creds.json') return null;

  for (const keyType of legacyAuthKeyTypes) {
    const prefix = `${keyType}-`;
    if (!fileName.startsWith(prefix)) continue;
    const keyId = fileName.slice(prefix.length, -'.json'.length);
    return keyId ? { keyType, keyId } : null;
  }

  return null;
}

