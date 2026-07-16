import { db } from '../db/sqlite';
import { publishQueueJob } from './redis';

export async function enqueueOutboundMessage(data: Record<string, any>) {
  const recordId = db.enqueueOutboundMessage(data);
  await publishQueueJob('outbound', recordId);
  return recordId;
}

export async function enqueueWebhookDelivery(data: Record<string, any>) {
  const recordId = db.enqueueWebhookDelivery(data);
  await publishQueueJob('webhook', recordId);
  return recordId;
}

export async function enqueueWorkerCommand(
  instanceId: string,
  command: string,
  payload: unknown = null,
) {
  const recordId = db.enqueueWorkerCommand(instanceId, command, payload);
  await publishQueueJob('command', recordId);
  return recordId;
}
