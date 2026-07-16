export type WhatsAppEventSettings = {
  messages: {
    receive_private_messages: boolean;
    send_private_messages_to_ai: boolean;
    log_outgoing_messages: boolean;
    log_reactions: boolean;
    log_deleted_messages: boolean;
    track_receipts: boolean;
    process_media_messages: boolean;
    include_media_base64: boolean;
  };
  groups: {
    ignore_group_messages: boolean;
    send_group_messages_to_ai: boolean;
    log_group_updates: boolean;
    log_participant_updates: boolean;
    log_join_requests: boolean;
  };
  calls: {
    detect_calls: boolean;
    auto_reject_calls: boolean;
    send_auto_reply: boolean;
    auto_reply_text: string;
  };
  contacts: {
    sync_contacts: boolean;
    track_chat_updates: boolean;
    track_presence: boolean;
    track_blocklist: boolean;
    import_history: boolean;
  };
  webhooks: {
    forward_non_message_events: boolean;
    forwarded_events: string[];
  };
};

export const DEFAULT_CALL_REPLY =
  'Sorry, I cannot take calls right now. Please send a message.';

export const DEFAULT_EVENT_SETTINGS: WhatsAppEventSettings = {
  messages: {
    receive_private_messages: true,
    send_private_messages_to_ai: true,
    log_outgoing_messages: true,
    log_reactions: false,
    log_deleted_messages: false,
    track_receipts: true,
    process_media_messages: true,
    include_media_base64: false,
  },
  groups: {
    ignore_group_messages: true,
    send_group_messages_to_ai: false,
    log_group_updates: false,
    log_participant_updates: false,
    log_join_requests: false,
  },
  calls: {
    detect_calls: true,
    auto_reject_calls: true,
    send_auto_reply: true,
    auto_reply_text: DEFAULT_CALL_REPLY,
  },
  contacts: {
    sync_contacts: true,
    track_chat_updates: true,
    track_presence: false,
    track_blocklist: false,
    import_history: false,
  },
  webhooks: {
    forward_non_message_events: false,
    forwarded_events: [
      'call.received',
      'message.deleted',
      'message.reaction',
      'group.participants',
      'group.updated',
      'contact.updated',
    ],
  },
};

export function getEventSettings(instance: any): WhatsAppEventSettings {
  const incoming = instance?.event_settings || {};
  const hasEventSettings = Boolean(instance?.event_settings);
  const merged: WhatsAppEventSettings = {
    messages: { ...DEFAULT_EVENT_SETTINGS.messages, ...incoming.messages },
    groups: { ...DEFAULT_EVENT_SETTINGS.groups, ...incoming.groups },
    calls: { ...DEFAULT_EVENT_SETTINGS.calls, ...incoming.calls },
    contacts: { ...DEFAULT_EVENT_SETTINGS.contacts, ...incoming.contacts },
    webhooks: { ...DEFAULT_EVENT_SETTINGS.webhooks, ...incoming.webhooks },
  };

  // Legacy field compatibility for existing instances.
  if (!hasEventSettings && typeof instance?.allow_groups === 'boolean') {
    merged.groups.ignore_group_messages = !instance.allow_groups;
    merged.groups.send_group_messages_to_ai = instance.allow_groups;
  }
  if (!hasEventSettings && typeof instance?.ignore_groups === 'boolean') {
    merged.groups.ignore_group_messages = instance.ignore_groups;
    merged.groups.send_group_messages_to_ai = !instance.ignore_groups;
  }
  if (!hasEventSettings && typeof instance?.reject_calls === 'boolean') {
    merged.calls.auto_reject_calls = instance.reject_calls;
  }
  if (!hasEventSettings && typeof instance?.msg_call === 'string' && instance.msg_call.trim()) {
    merged.calls.auto_reply_text = instance.msg_call;
  }

  return merged;
}

export function toJsonSafePayload(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
