class ReceiptCascade20260924000008 {
  name = 'ReceiptCascade20260924000008';

  async up(queryRunner) {
    await queryRunner.query('ALTER TABLE mock_delivery_receipts DROP CONSTRAINT mock_delivery_receipts_outbound_event_id_fkey');
    await queryRunner.query(`
      ALTER TABLE mock_delivery_receipts ADD CONSTRAINT mock_delivery_receipts_outbound_event_id_fkey
      FOREIGN KEY (outbound_event_id) REFERENCES mock_outbound_events(id) ON DELETE CASCADE
    `);
  }

  async down(queryRunner) {
    await queryRunner.query('ALTER TABLE mock_delivery_receipts DROP CONSTRAINT mock_delivery_receipts_outbound_event_id_fkey');
    await queryRunner.query(`
      ALTER TABLE mock_delivery_receipts ADD CONSTRAINT mock_delivery_receipts_outbound_event_id_fkey
      FOREIGN KEY (outbound_event_id) REFERENCES mock_outbound_events(id)
    `);
  }
}

module.exports = { ReceiptCascade20260924000008 };
