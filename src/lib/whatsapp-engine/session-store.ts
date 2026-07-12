import fs from 'fs';
import path from 'path';
import { initAuthCreds, BufferJSON, AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';

export const getSessionRoot = () => {
  return process.env.WHATSAPP_SESSION_ROOT || path.join(/* turbopackIgnore: true */ process.cwd(), 'data', 'whatsapp-sessions');
};

export async function useMultiFileAuthState(instanceId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> {
  const folder = path.join(getSessionRoot(), instanceId);

  // Ensure folder exists
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  const writeData = (data: any, file: string) => {
    return fs.promises.writeFile(path.join(folder, file), JSON.stringify(data, BufferJSON.replacer));
  };

  const readData = async (file: string) => {
    try {
      const data = await fs.promises.readFile(path.join(folder, file), { encoding: 'utf-8' });
      return JSON.parse(data, BufferJSON.reviver);
    } catch (error) {
      return null;
    }
  };

  const removeData = async (file: string) => {
    try {
      if (fs.existsSync(path.join(folder, file))) {
        await fs.promises.unlink(path.join(folder, file));
      }
    } catch {
      // ignore
    }
  };

  const creds = await readData('creds.json') || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: keyof SignalDataTypeMap, ids: string[]) => {
          const data: { [key: string]: any } = {};
          await Promise.all(
            ids.map(async id => {
              let value = await readData(`${type}-${id}.json`);
              if (type === 'app-state-sync-key' && value) {
                value = { ...value, encKey: Buffer.from(value.encKey, 'base64'), macKey: Buffer.from(value.macKey, 'base64') };
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data: any) => {
          const tasks: Promise<void>[] = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const file = `${category}-${id}.json`;
              if (value) {
                tasks.push(writeData(value, file));
              } else {
                tasks.push(removeData(file));
              }
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData(creds, 'creds.json')
  };
}
