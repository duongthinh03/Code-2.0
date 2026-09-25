class PhoneE16420260924000006 {
  name = 'PhoneE16420260924000006';

  async up(queryRunner) {
    await queryRunner.query(`
      UPDATE mock_bitrix_leads
      SET normalized_phone = '+84' || substring(normalized_phone FROM 2)
      WHERE normalized_phone ~ '^0[0-9]{9,10}$'
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`
      UPDATE mock_bitrix_leads
      SET normalized_phone = '0' || substring(normalized_phone FROM 4)
      WHERE normalized_phone ~ '^\\+84[0-9]{9,10}$'
    `);
  }
}

module.exports = { PhoneE16420260924000006 };
