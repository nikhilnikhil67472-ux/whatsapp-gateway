import { getEventSettings } from '../whatsapp-engine/event-settings';

export function toPublicInstance(
  instance: Record<string, any> | null,
  options: { includeWebhookSecret?: boolean } = {},
) {
  if (!instance) return null;
  const publicInstance = { ...instance };
  delete publicInstance.n8n_secret_encrypted;
  delete publicInstance.ai_api_key_encrypted;
  delete publicInstance.api_key_hash;
  if (!options.includeWebhookSecret) delete publicInstance.webhook_secret;

  return {
    ...publicInstance,
    has_n8n_secret: Boolean(instance.n8n_secret_encrypted),
    has_ai_api_key: Boolean(instance.ai_api_key_encrypted),
    event_settings: getEventSettings(instance),
  };
}
