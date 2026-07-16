import fs from 'fs';
import path from 'path';
import {
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import { db } from '../db/sqlite';
import {
  decryptStoredValue,
  encryptStoredValue,
  isEncryptedStoredValue,
} from '../security/encrypt';
import { logger } from '../observability/logger';

export const getLegacySessionRoot = () =>
  process.env.WHATSAPP_SESSION_ROOT
  || path.join(/* turbopackIgnore: true */ process.cwd(), 'data', 'whatsapp-sessions');

function serialize(value: unknown) {
  return JSON.stringify(value, BufferJSON.replacer);
}

function deserialize<T>(value: string): T {
  return JSON.parse(value, BufferJSON.reviver) as T;
}

async function readLegacyValue(instanceId: string, fileName: string) {
  try {
    const filePath = path.join(getLegacySessionRoot(), instanceId, fileName);
    const contents = await fs.promises.readFile(filePath, 'utf8');
    return contents;
  } catch {
    return null;
  }
}

export async function createSqliteAuthState(
  instanceId: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  let serializedCreds = db.getAuthCreds(instanceId);

  if (!serializedCreds) {
    serializedCreds = await readLegacyValue(instanceId, 'creds.json');
    if (serializedCreds) {
      db.saveAuthCreds(instanceId, encryptStoredValue(serializedCreds));
      logger.info({ instance_id: instanceId }, 'Migrated legacy Baileys credentials into SQLite.');
    }
  }

  if (serializedCreds) {
    const encrypted = isEncryptedStoredValue(serializedCreds);
    const decrypted = decryptStoredValue(serializedCreds);
    serializedCreds = decrypted.value;
    if (!encrypted) {
      db.saveAuthCreds(instanceId, encryptStoredValue(serializedCreds));
      logger.info({ instance_id: instanceId }, 'Encrypted existing Baileys credentials at rest.');
    }
  }

  const creds = serializedCreds
    ? deserialize<AuthenticationState['creds']>(serializedCreds)
    : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const stored = db.getAuthKeys(instanceId, type, ids);
          const values: { [id: string]: SignalDataTypeMap[T] } = {};

          for (const keyId of ids) {
            let serialized = stored.get(keyId) || null;

            if (!serialized) {
              serialized = await readLegacyValue(instanceId, `${type}-${keyId}.json`);
              if (serialized) {
                db.saveAuthKey(instanceId, type, keyId, encryptStoredValue(serialized));
              }
            }

            if (!serialized) continue;
            const encrypted = isEncryptedStoredValue(serialized);
            const decrypted = decryptStoredValue(serialized);
            serialized = decrypted.value;
            if (!encrypted) {
              db.saveAuthKey(instanceId, type, keyId, encryptStoredValue(serialized));
            }
            let value = deserialize<SignalDataTypeMap[T]>(serialized);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(
                value as unknown as Record<string, unknown>,
              ) as unknown as SignalDataTypeMap[T];
            }
            values[keyId] = value;
          }

          return values;
        },
        set: async (data) => {
          const transaction = Object.entries(data).flatMap(([type, entries]) =>
            Object.entries(entries || {}).map(([keyId, value]) => ({
              type,
              keyId,
              value,
            })),
          );

          db.saveAuthKeys(
            instanceId,
            transaction.map((item) => ({
              keyType: item.type,
              keyId: item.keyId,
              data: item.value ? encryptStoredValue(serialize(item.value)) : null,
            })),
          );
        },
      },
    },
    saveCreds: async () => {
      db.saveAuthCreds(instanceId, encryptStoredValue(serialize(creds)));
    },
  };
}

export async function clearSqliteAuthState(instanceId: string) {
  db.clearAuthState(instanceId);
}
