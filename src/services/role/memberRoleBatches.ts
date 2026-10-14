import { setTimeout as delay } from "node:timers/promises";

export const MEMBER_ROLE_BATCH_SIZE = 25;
export const MEMBER_ROLE_CONCURRENCY = 5;
export const MEMBER_ROLE_BATCH_PAUSE_MS = 1000;

export const processMemberRoleBatches = async <T>(
  items: T[],
  process: (item: T) => Promise<void>,
  onBatch: (batchNumber: number, pausing: boolean) => void,
  pause: (ms: number) => Promise<unknown> = delay,
): Promise<void> => {
  for (let offset = 0; offset < items.length; offset += MEMBER_ROLE_BATCH_SIZE) {
    const batchNumber = Math.floor(offset / MEMBER_ROLE_BATCH_SIZE) + 1;
    onBatch(batchNumber, false);
    const batch = items.slice(offset, offset + MEMBER_ROLE_BATCH_SIZE);
    for (let index = 0; index < batch.length; index += MEMBER_ROLE_CONCURRENCY) {
      await Promise.all(batch.slice(index, index + MEMBER_ROLE_CONCURRENCY).map(process));
    }
    if (offset + MEMBER_ROLE_BATCH_SIZE < items.length) {
      onBatch(batchNumber, true);
      await pause(MEMBER_ROLE_BATCH_PAUSE_MS);
    }
  }
};
