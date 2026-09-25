import type { MockLeadInput } from '../webhooks/mock-bitrix.client';

type Method = 'crm.item.list' | 'crm.item.add' | 'crm.item.update' | 'crm.item.get';
type BitrixEnvelope<T> = { result?: T; error?: unknown };
type BitrixItem = { id: number; originatorId?: string; originId?: string };

export const BITRIX_ORIGINATOR_ID = 'TIKTOK_LEAD_SYNC';

export function bitrixLeadFields(input: MockLeadInput) {
  const fm = [
    ...(input.email ? [{ typeId: 'EMAIL', valueType: 'WORK', value: input.email }] : []),
    ...(input.phone ? [{ typeId: 'PHONE', valueType: 'WORK', value: input.phone }] : []),
  ];
  if (!fm.length) throw new Error('Lead requires an email or phone');
  return {
    title: `TikTok: ${input.fullName ?? input.externalLeadId}`,
    name: input.fullName ?? undefined,
    originatorId: BITRIX_ORIGINATOR_ID,
    originId: input.externalLeadId,
    utmSource: 'tiktok',
    utmCampaign: input.campaignName ?? input.campaignId ?? undefined,
    fm,
  };
}

export type BitrixDealInput = {
  externalLeadId: string;
  leadId: number;
  title: string;
  categoryId: number;
  stageId: string;
  probability: number;
  amount: number | null;
  currency: string;
};

export function bitrixDealFields(input: BitrixDealInput) {
  return {
    title: input.title,
    leadId: input.leadId,
    categoryId: input.categoryId,
    stageId: input.stageId,
    probability: input.probability,
    ...(input.amount !== null ? { isManualOpportunity: 'Y', opportunity: input.amount } : {}),
    currencyId: input.currency,
    originatorId: BITRIX_ORIGINATOR_ID,
    originId: `deal:${input.externalLeadId}`,
  };
}

/** Secret-safe transport for universal CRM methods. */
export class BitrixRestClient {
  private readonly baseUrl: URL;

  constructor(webhookUrl: string, private readonly fetcher: typeof fetch = fetch) {
    let url: URL;
    try { url = new URL(webhookUrl); }
    catch { throw new Error('Invalid Bitrix24 webhook URL'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        !/^\/rest\/\d+\/[^/]+\/$/.test(url.pathname)) {
      throw new Error('Bitrix24 webhook URL must be an HTTPS base URL');
    }
    this.baseUrl = url;
  }

  async findLeadByExternalId(externalLeadId: string): Promise<number | null> {
    return this.findItemByOrigin(1, externalLeadId);
  }

  async findDealByExternalId(externalLeadId: string): Promise<number | null> {
    return this.findItemByOrigin(2, `deal:${externalLeadId}`);
  }

  private async findItemByOrigin(entityTypeId: 1 | 2, originId: string): Promise<number | null> {
    const result = await this.call<{ items: BitrixItem[] }>('crm.item.list', {
      entityTypeId,
      filter: { originatorId: BITRIX_ORIGINATOR_ID, originId },
      select: ['id', 'originatorId', 'originId'],
      start: 0,
    });
    if (!Array.isArray(result?.items)) throw new Error('Bitrix24 item list response is invalid');
    if (result.items.length > 1) throw new Error('Duplicate Bitrix24 items share the same external ID');
    const item = result.items[0];
    if (!item) return null;
    if (!Number.isSafeInteger(item.id) || item.id < 1 ||
        item.originatorId !== BITRIX_ORIGINATOR_ID || item.originId !== originId) {
      throw new Error('Bitrix24 item lookup returned an unexpected item');
    }
    return item.id;
  }

  async addLead(input: MockLeadInput): Promise<number> {
    const result = await this.call<{ item: BitrixItem }>('crm.item.add', {
      entityTypeId: 1,
      fields: bitrixLeadFields(input),
    });
    const id = result?.item?.id;
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Bitrix24 Lead add response is invalid');
    return id;
  }

  async updateLead(id: number, input: MockLeadInput): Promise<void> {
    const result = await this.call<{ item: BitrixItem }>('crm.item.update', {
      entityTypeId: 1, id, fields: bitrixLeadFields(input),
    });
    if (result?.item?.id !== id) throw new Error('Bitrix24 Lead update response is invalid');
  }

  async addDeal(input: BitrixDealInput): Promise<number> {
    const result = await this.call<{ item: BitrixItem }>('crm.item.add', {
      entityTypeId: 2, fields: bitrixDealFields(input),
    });
    const id = result?.item?.id;
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Bitrix24 Deal add response is invalid');
    return id;
  }

  async updateDeal(id: number, input: BitrixDealInput): Promise<void> {
    const result = await this.call<{ item: BitrixItem }>('crm.item.update', {
      entityTypeId: 2, id,
      fields: bitrixDealFields(input),
    });
    if (result?.item?.id !== id) throw new Error('Bitrix24 Deal update response is invalid');
  }

  async getItem(entityTypeId: 1 | 2, id: number): Promise<BitrixItem & {
    leadId?: number; categoryId?: number; stageId?: string;
  }> {
    const result = await this.call<{ item: BitrixItem & {
      leadId?: number; categoryId?: number; stageId?: string;
    } }>('crm.item.get', { entityTypeId, id });
    if (result?.item?.id !== id) throw new Error('Bitrix24 item get response is invalid');
    return result.item;
  }

  private async call<T>(method: Method, params: Record<string, unknown>): Promise<T> {
    const endpoint = new URL(`${method}.json`, this.baseUrl);
    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(params),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // The webhook URL contains a secret; never include it in errors or logs.
      throw new Error(`Bitrix24 ${method} request failed or timed out`);
    }
    if (!response.ok) throw new Error(`Bitrix24 ${method} returned HTTP ${response.status}`);
    let body: BitrixEnvelope<T>;
    try { body = await response.json() as BitrixEnvelope<T>; }
    catch { throw new Error(`Bitrix24 ${method} returned invalid JSON`); }
    if (body.error) {
      const code = typeof body.error === 'string' && /^[A-Z0-9_]+$/.test(body.error)
        ? body.error : 'API_ERROR';
      throw new Error(`Bitrix24 ${method} returned ${code}`);
    }
    if (body.result === undefined) throw new Error(`Bitrix24 ${method} returned no result`);
    return body.result;
  }
}
