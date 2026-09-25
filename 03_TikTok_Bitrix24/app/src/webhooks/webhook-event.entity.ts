import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 128 })
  eventId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ name: 'payload_sha256', type: 'char', length: 64 })
  payloadSha256!: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'queue_status', type: 'varchar', length: 16, default: 'pending' })
  queueStatus!: string;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'enqueued_at', type: 'timestamptz', nullable: true })
  enqueuedAt!: Date | null;
}
