class BitrixSyncState20260924000011 {
  name = 'BitrixSyncState20260924000011';

  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE bitrix_sync_state (
        mock_lead_id bigint PRIMARY KEY REFERENCES mock_bitrix_leads(id),
        bitrix_lead_id bigint,
        bitrix_deal_id bigint,
        status varchar(16) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'synced', 'failed')),
        last_error text,
        synced_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner) {
    await queryRunner.query('DROP TABLE bitrix_sync_state');
  }
}

module.exports = { BitrixSyncState20260924000011 };
