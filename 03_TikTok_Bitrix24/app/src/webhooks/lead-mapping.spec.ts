import { defaultMappings, mapLeadPayload, validateMappings } from './lead-mapping';

describe('Lead mapping and validation', () => {
  it('maps and normalizes mock payload', () => {
    const lead = mapLeadPayload({
      event_id: 'evt-1', data: {
        lead_id: 'lead-1', full_name: '  Nguyễn A  ',
        email: 'A@Example.com ', phone: '+84 901 234 567',
        campaign_id: 'spring-sale', ad_id: 'ad-1', form_id: 'form-1',
      },
    }, defaultMappings);
    expect(lead).toMatchObject({
      externalLeadId: 'lead-1', fullName: 'Nguyễn A', email: 'a@example.com',
      phone: '+84901234567', campaignId: 'spring-sale', adId: 'ad-1', formId: 'form-1',
    });
  });

  it('accepts the PDF sample shape without inventing a TikTok lead ID', () => {
    const lead = mapLeadPayload({
      event_id: 'evt-pdf', campaign: { campaign_id: 'sale-1', ad_id: 'ad-2' },
      form: { form_id: 'form-3' },
      lead_data: { full_name: 'A', email: 'a@example.com' },
    }, defaultMappings);
    expect(lead).toMatchObject({ externalLeadId: 'evt-pdf', campaignId: 'sale-1',
      adId: 'ad-2', formId: 'form-3' });
  });

  it('rejects invalid contacts and unsafe mapping paths', () => {
    expect(() => mapLeadPayload({ event_id: 'x', data: { lead_id: 'y', email: 'bad' } }, defaultMappings))
      .toThrow('Invalid email');
    expect(() => validateMappings({ email: '__proto__.polluted' })).toThrow('Invalid mapping path');
  });

  it('maps configured mock Bitrix custom fields safely', () => {
    const mappings = validateMappings({ customFields: { UF_CRM_UTM_SOURCE: 'data.utm_source' } });
    const lead = mapLeadPayload({ event_id: 'custom-1', data: {
      lead_id: 'custom-lead-1', email: 'custom@example.com', utm_source: ' tiktok ',
    } }, mappings);
    expect(lead.customFields).toEqual({ UF_CRM_UTM_SOURCE: 'tiktok' });
    expect(() => validateMappings({ customFields: { 'UF_BAD': 'data.foo' } }))
      .toThrow('Invalid custom field mapping');
  });
});
