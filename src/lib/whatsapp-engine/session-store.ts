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
import {
  legacyAuthFileName,
  parseLegacyAuthKeyFile,
} from './legacy-auth';

export const getLegacySessionRoot = () =>
  process.env.WHATSAPP_SESSION_ROOT
  || path.join(/* turbopackIgnore: true */ process.cwd(), 'data', 'whatsapp-sessions');

const migratedAuthInstances = new Set<string>();

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

async function removeLegacyFile(filePath: string) {
  if (process.env.BAILEYS_DELETE_LEGACY_AUTH_AFTER_MIGRATION !== 'true') return false;
  await fs.promises.unlink(filePath);
  return true;
}

async function migrateLegacyAuthState(instanceId: string) {
  if (migratedAuthInstances.has(instanceId)) return;

  const sessionDirectory = path.join(getLegacySessionRoot(), instanceId);
  const storedCreds = db.getAuthCreds(instanceId);
  if (storedCreds && !isEncryptedStoredValue(storedCreds)) {
    db.saveAuthCreds(instanceId, encryptStoredValue(storedCreds));
  }

  const plaintextRows = db.listAuthKeys(instanceId)
    .filter((row) => !isEncryptedStoredValue(row.data));
  if (plaintextRows.length) {
    db.saveAuthKeys(
      instanceId,
      plaintextRows.map((row) => ({
        keyType: row.key_type,
        keyId: row.key_id,
        data: encryptStoredValue(row.data),
      })),
    );
  }

  let fileNames: string[];
  try {
    fileNames = await fs.promises.readdir(sessionDirectory);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
    migratedAuthInstances.add(instanceId);
    return;
  }

  let migratedCreds = 0;
  let migratedKeys = 0;
  let deletedFiles = 0;
  const credentialPath = path.join(sessionDirectory, 'creds.json');

  if (fileNames.includes('creds.json')) {
    if (!db.getAuthCreds(instanceId)) {
      const legacyCreds = await readLegacyValue(instanceId, 'creds.json');
      if (legacyCreds) {
        db.saveAuthCreds(instanceId, encryptStoredValue(legacyCreds));
        migratedCreds = 1;
      }
    }
    if (isEncryptedStoredValue(db.getAuthCreds(instanceId) || '')) {
      deletedFiles += Number(await removeLegacyFile(credentialPath));
    }
  }

  const legacyKeys = fileNames
    .map((fileName) => ({
      fileName,
      parsed: parseLegacyAuthKeyFile(fileName),
    }))
    .filter((entry): entry is {
      fileName: string;
      parsed: NonNullable<ReturnType<typeof parseLegacyAuthKeyFile>>;
    } => Boolean(entry.parsed));

  const keyTypes = new Set(legacyKeys.map((entry) => entry.parsed.keyType));
  for (const keyType of keyTypes) {
    const entries = legacyKeys.filter((entry) => entry.parsed.keyType === keyType);
    const existing = db.getAuthKeys(
      instanceId,
      keyType,
      entries.map((entry) => entry.parsed.keyId),
    );
    const inserts: Array<{ keyType: string; keyId: string; data: string }> = [];

    for (const entry of entries) {
      if (existing.has(entry.parsed.keyId)) continue;
      const serialized = await readLegacyValue(instanceId, entry.fileName);
      if (!serialized) continue;
      inserts.push({
        keyType,
        keyId: entry.parsed.keyId,
        data: encryptStoredValue(serialized),
      });
    }

    if (inserts.length) {
      db.saveAuthKeys(instanceId, inserts);
      migratedKeys += inserts.length;
    }

    if (process.env.BAILEYS_DELETE_LEGACY_AUTH_AFTER_MIGRATION === 'true') {
      const persisted = db.getAuthKeys(
        instanceId,
        keyType,
        entries.map((entry) => entry.parsed.keyId),
      );
      for (const entry of entries) {
        if (!isEncryptedStoredValue(persisted.get(entry.parsed.keyId) || '')) continue;
        deletedFiles += Number(
          await removeLegacyFile(path.join(sessionDirectory, entry.fileName)),
        );
      }
    }
  }

  if (process.env.BAILEYS_DELETE_LEGACY_AUTH_AFTER_MIGRATION === 'true') {
    await fs.promises.rmdir(sessionDirectory).catch((error: any) => {
      if (!['ENOENT', 'ENOTEMPTY'].includes(error?.code)) throw error;
    });
  }

  migratedAuthInstances.add(instanceId);
  if (migratedCreds || migratedKeys || plaintextRows.length || deletedFiles) {
    logger.info({
      instance_id: instanceId,
      migrated_credentials: migratedCreds,
      migrated_keys: migratedKeys,
      encrypted_existing_keys: plaintextRows.length,
      deleted_legacy_files: deletedFiles,
    }, 'Baileys authentication state migration completed.');
  }
}

export async function createSqliteAuthState(
  instanceId: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  await migrateLegacyAuthState(instanceId);
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
          const legacyKeyIds = new Map(
            ids.map((keyId) => {
              const parsed = parseLegacyAuthKeyFile(legacyAuthFileName(type, keyId));
              return [keyId, parsed?.keyId || keyId];
            }),
          );
          const legacyStored = db.getAuthKeys(
            instanceId,
            type,
            [...new Set(legacyKeyIds.values())],
          );
          const values: { [id: string]: SignalDataTypeMap[T] } = {};

          for (const keyId of ids) {
            const legacyKeyId = legacyKeyIds.get(keyId) || keyId;
            const directSerialized = stored.get(keyId) || null;
            const legacySerialized = legacyStored.get(legacyKeyId) || null;
            const loadedFromLegacyKey = !directSerialized && Boolean(legacySerialized);
            let serialized = directSerialized || legacySerialized;

            if (!serialized) {
              serialized = await readLegacyValue(
                instanceId,
                legacyAuthFileName(type, keyId),
              );
              if (serialized) {
                db.saveAuthKey(instanceId, type, keyId, encryptStoredValue(serialized));
              }
            }

            if (!serialized) continue;
            const encrypted = isEncryptedStoredValue(serialized);
            const decrypted = decryptStoredValue(serialized);
            serialized = decrypted.value;
            if (!encrypted || loadedFromLegacyKey) {
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
  migratedAuthInstances.delete(instanceId);
  db.clearAuthState(instanceId);
}
