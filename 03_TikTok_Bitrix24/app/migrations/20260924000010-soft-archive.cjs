class SoftArchive20260924000010 {
  name = 'SoftArchive20260924000010';

  async up(queryRunner) {
    await queryRunner.query('ALTER TABLE mock_bitrix_leads ADD COLUMN archived_at timestamptz');
    await queryRunner.query('ALTER TABLE mock_bitrix_deals ADD COLUMN archived_at timestamptz');
    await queryRunner.query('CREATE INDEX mock_leads_active_idx ON mock_bitrix_leads(id) WHERE archived_at IS NULL');
    await queryRunner.query('CREATE INDEX mock_deals_active_idx ON mock_bitrix_deals(id) WHERE archived_at IS NULL');
  }

  async down(queryRunner) {
    await queryRunner.query('DROP INDEX mock_deals_active_idx');
    await queryRunner.query('DROP INDEX mock_leads_active_idx');
    await queryRunner.query('ALTER TABLE mock_bitrix_deals DROP COLUMN archived_at');
    await queryRunner.query('ALTER TABLE mock_bitrix_leads DROP COLUMN archived_at');
  }
}

module.exports = { SoftArchive20260924000010 };
