import { Injectable, Logger } from '@nestjs/common';
import { ISyncQueueRepository } from '../../../core/interfaces/sync-queue-repository.interface';
import { SyncQueueItem } from '../../../core/domain/sync-queue.entity';
import { SupabaseService } from '../supabase.service';

@Injectable()
export class SupabaseSyncQueueRepository implements ISyncQueueRepository {
  private readonly logger = new Logger(SupabaseSyncQueueRepository.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async findByClientTxId(clientTxId: string): Promise<SyncQueueItem | null> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('sync_queue')
      .select('*')
      .eq('client_tx_id', clientTxId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Error querying sync queue: ${error.message}`);
      return null;
    }
    return data as SyncQueueItem | null;
  }

  async enqueue(item: Partial<SyncQueueItem>): Promise<SyncQueueItem> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('sync_queue')
      .insert(item)
      .select()
      .single();

    if (error) {
      this.logger.error(`Error enqueueing sync item: ${error.message}`);
      throw new Error(error.message);
    }
    return data as SyncQueueItem;
  }

  async markProcessed(clientTxId: string): Promise<void> {
    const { error } = await this.supabaseService
      .getAdminClient()
      .from('sync_queue')
      .update({
        status: 'PROCESSED',
        processed_at: new Date().toISOString(),
      })
      .eq('client_tx_id', clientTxId);

    if (error) {
      this.logger.error(`Error updating sync queue status: ${error.message}`);
    }
  }

  async markRejected(clientTxId: string, errorMessage: string): Promise<void> {
    const { error } = await this.supabaseService
      .getAdminClient()
      .from('sync_queue')
      .update({
        status: 'REJECTED',
        error_message: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq('client_tx_id', clientTxId);

    if (error) {
      this.logger.error(`Error rejecting sync queue item: ${error.message}`);
    }
  }
}
