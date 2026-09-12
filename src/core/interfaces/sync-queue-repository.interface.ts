import { SyncQueueItem } from '../domain/sync-queue.entity';

export interface ISyncQueueRepository {
  findByClientTxId(clientTxId: string): Promise<SyncQueueItem | null>;
  enqueue(item: Partial<SyncQueueItem>): Promise<SyncQueueItem>;
  markProcessed(clientTxId: string): Promise<void>;
  markRejected(clientTxId: string, error: string): Promise<void>;
}
