import { bitrixDealFields, bitrixLeadFields, BitrixRestClient, BITRIX_ORIGINATOR_ID } from './bitrix-rest.client';
import type { MockLeadInput } from '../webhooks/mock-bitrix.client';

const webhookUrl = 'https://example.bitrix24.vn/rest/1/private-token/';
const input: MockLeadInput = {
  externalLeadId: 'tiktok-123', fullName: 'Nguyễn A', email: 'a@example.com', phone: '+84901234567',
  campaignId: 'campaign-1', campaignName: 'Spring sale', adId: null, formId: null,
  city: null, ttclid: null, rawData: {},
};

function mockFetch(result: unknown): jest.MockedFunction<typeof fetch> {
  return jest.fn().mockImplementation(async () => new Response(JSON.stringify({ result }), { status: 200 }));
}

describe('Bitrix24 REST client (no live calls)', () => {
  it('builds universal CRM Lead fields with source identity and contact multifields', () => {
    expect(bitrixLeadFields(input)).toEqual({
      title: 'TikTok: Nguyễn A', name: 'Nguyễn A',
      originatorId: BITRIX_ORIGINATOR_ID, originId: 'tiktok-123',
      utmSource: 'tiktok', utmCampaign: 'Spring sale',
      fm: [
        { typeId: 'EMAIL', valueType: 'WORK', value: 'a@example.com' },
        { typeId: 'PHONE', valueType: 'WORK', value: '+84901234567' },
      ],
    });
  });

  it('finds a Lead by exact external source fields', async () => {
    const fetcher = mockFetch({ items: [{ id: 42, originatorId: BITRIX_ORIGINATOR_ID, originId: 'tiktok-123' }] });
    const client = new BitrixRestClient(webhookUrl, fetcher);
    expect(await client.findLeadByExternalId('tiktok-123')).toBe(42);
    const [endpoint, options] = fetcher.mock.calls[0];
    expect(String(endpoint)).toBe(`${webhookUrl}crm.item.list.json`);
    expect(JSON.parse(String(options?.body))).toMatchObject({
      entityTypeId: 1,
      filter: { originatorId: BITRIX_ORIGINATOR_ID, originId: 'tiktok-123' },
    });
  });

  it('prepares a create request without making a live network call', async () => {
    const fetcher = mockFetch({ item: { id: 43 } });
    const client = new BitrixRestClient(webhookUrl, fetcher);
    expect(await client.addLead(input)).toBe(43);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      entityTypeId: 1,
      fields: { originId: 'tiktok-123', fm: [{ typeId: 'EMAIL' }, { typeId: 'PHONE' }] },
    });
  });

  it('creates and updates a Deal linked to its Lead using portal stage IDs', async () => {
    const fetcher = mockFetch({ item: { id: 66 } });
    const client = new BitrixRestClient(webhookUrl, fetcher);
    const deal = {
      externalLeadId: 'tiktok-123', leadId: 43, title: 'Deal: Nguyễn A',
      categoryId: 0, stageId: 'NEW', probability: 30, amount: null, currency: 'VND',
    };
    expect(bitrixDealFields(deal)).toMatchObject({
      leadId: 43, categoryId: 0, stageId: 'NEW',
      originatorId: BITRIX_ORIGINATOR_ID, originId: 'deal:tiktok-123',
    });
    expect(await client.addDeal(deal)).toBe(66);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      entityTypeId: 2, fields: { leadId: 43, stageId: 'NEW' },
    });
    await client.updateDeal(66, { ...deal, stageId: 'WON', amount: 1_000_000 });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({
      entityTypeId: 2, id: 66, fields: { stageId: 'WON', opportunity: 1_000_000 },
    });
  });

  it('finds Deal by a separate source ID and rejects duplicate matches', async () => {
    const fetcher = mockFetch({ items: [{ id: 66, originatorId: BITRIX_ORIGINATOR_ID, originId: 'deal:tiktok-123' }] });
    const client = new BitrixRestClient(webhookUrl, fetcher);
    expect(await client.findDealByExternalId('tiktok-123')).toBe(66);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      entityTypeId: 2, filter: { originId: 'deal:tiktok-123' },
    });
    const duplicateClient = new BitrixRestClient(webhookUrl, mockFetch({ items: [
      { id: 1, originatorId: BITRIX_ORIGINATOR_ID, originId: 'deal:tiktok-123' },
      { id: 2, originatorId: BITRIX_ORIGINATOR_ID, originId: 'deal:tiktok-123' },
    ] }));
    await expect(duplicateClient.findDealByExternalId('tiktok-123')).rejects.toThrow('Duplicate');
  });

  it('rejects unsafe URL shapes and does not expose the secret in request errors', async () => {
    expect(() => new BitrixRestClient('http://example.bitrix24.vn/rest/1/private-token/')).toThrow();
    expect(() => new BitrixRestClient(`${webhookUrl}crm.item.add.json`)).toThrow();
    const fetcher = jest.fn().mockRejectedValue(new Error(`network error at ${webhookUrl}`)) as jest.MockedFunction<typeof fetch>;
    const client = new BitrixRestClient(webhookUrl, fetcher);
    await expect(client.findLeadByExternalId('x')).rejects.toThrow('request failed or timed out');
    await expect(client.findLeadByExternalId('x')).rejects.not.toThrow('private-token');
  });
});
