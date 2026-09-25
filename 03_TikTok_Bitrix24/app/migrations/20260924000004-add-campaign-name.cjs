class AddCampaignName20260924000004 {
  name = 'AddCampaignName20260924000004';

  async up(queryRunner) {
    await queryRunner.query('ALTER TABLE mock_bitrix_leads ADD COLUMN campaign_name text');
  }

  async down(queryRunner) {
    await queryRunner.query('ALTER TABLE mock_bitrix_leads DROP COLUMN campaign_name');
  }
}

module.exports = { AddCampaignName20260924000004 };
