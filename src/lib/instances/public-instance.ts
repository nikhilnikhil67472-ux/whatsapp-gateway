import { getEventSettings } from '../whatsapp-engine/event-settings';

export function toPublicInstance(instance: Record<string, any> | null) {
  if (!instance) return null;
  const publicInstance = { ...instance };
  delete publicInstance.n8n_secret_encrypted;
  delete publicInstance.api_key_hash;

  return {
    ...publicInstance,
    has_n8n_secret: Boolean(instance.n8n_secret_encrypted),
    event_settings: getEventSettings(instance),
  };
}
