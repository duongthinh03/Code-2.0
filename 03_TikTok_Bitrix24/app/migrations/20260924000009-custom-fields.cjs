class CustomFields20260924000009 {
  name = 'CustomFields20260924000009';

  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE mock_bitrix_leads ADD COLUMN custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  async down(queryRunner) {
    await queryRunner.query('ALTER TABLE mock_bitrix_leads DROP COLUMN custom_fields');
  }
}

module.exports = { CustomFields20260924000009 };
