import axios, { type AxiosInstance } from 'axios';
import { ApiError, safeError, sleep, withRetry } from './reliability.js';
import type { BitrixLead, BitrixLeadFields } from './types.js';

interface Envelope<T> { result?: T; error?: string; error_description?: string }
export class BitrixClient {
  private readonly http: AxiosInstance;
  private lastRequest = 0;
  constructor(webhookUrl: string, http?: AxiosInstance, private interval = Number(process.env.BITRIX_REQUEST_INTERVAL_MS ?? 550)) {
    if (!Number.isFinite(interval) || interval < 0) throw new Error('BITRIX_REQUEST_INTERVAL_MS không hợp lệ');
    this.http = http ?? axios.create({ baseURL: webhookUrl.replace(/\/+$/, '') + '/', timeout: 20_000 });
  }
  private async call<T>(method: string, payload: Record<string, unknown>, repeatSafe = true): Promise<T> {
    const operation = async () => {
      await sleep(Math.max(0, this.interval - (Date.now() - this.lastRequest)));
      this.lastRequest = Date.now();
      let body: Envelope<T>;
      try { body = (await this.http.post<Envelope<T>>(`${method}.json`, payload)).data; }
      catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          const status = error.response.status;
          const data = error.response.data;
          const code = typeof data?.error === 'string' ? data.error :
            typeof data?.error?.code === 'string' ? data.error.code : '';
          const description = typeof data?.error_description === 'string' ? data.error_description :
            typeof data?.error?.message === 'string' ? data.error.message : '';
          const reason = safeError(new Error(description || code ||
            `không có thông báo lỗi JSON; content-type=${error.response.headers?.['content-type'] ?? 'không rõ'}`));
          throw new ApiError(`Bitrix ${method} HTTP ${status}: ${reason}`,
            /QUERY_LIMIT|TOO_MANY|TEMPORAR/.test(code), code);
        }
        throw error;
      }
      if (body.error) throw new ApiError(body.error_description ?? body.error, /QUERY_LIMIT|TOO_MANY|TEMPORAR/.test(body.error), body.error);
      if (body.result === undefined) throw new ApiError(`Bitrix24 thiếu result cho ${method}`);
      return body.result;
    };
    // Creation is not idempotent; never blindly replay after an ambiguous timeout.
    return repeatSafe ? withRetry(operation) : operation();
  }
  async getLead(id: string): Promise<BitrixLead> {
    const lead = await this.call<BitrixLead>('crm.lead.get', { id });
    if (!lead || String(lead.ID) !== id) throw new Error(`Lead ID ${id} không tồn tại hoặc không đọc được`);
    return { ...lead, ID: String(lead.ID) };
  }
  async findPotentialDuplicates(email: string, phone: string): Promise<BitrixLead[]> {
    const ids = new Set<string>();
    for (const [type, value] of [['EMAIL', email], ['PHONE', phone]] as const) {
      if (!value) continue;
      const result = await this.call<{ LEAD?: unknown[] }>('crm.duplicate.findbycomm', {
        entity_type: 'LEAD', type, values: [value],
      });
      for (const id of result?.LEAD ?? []) if (/^[1-9]\d*$/.test(String(id))) ids.add(String(id));
    }
    const active: BitrixLead[] = [];
    const candidates = [...ids];
    for (let i = 0; i < candidates.length; i += 50) {
      const leads = await this.call<BitrixLead[]>('crm.lead.list', {
        filter: { '@ID': candidates.slice(i, i + 50), '=STATUS_SEMANTIC_ID': 'P' }, select: ['ID', 'STATUS_SEMANTIC_ID'],
      });
      for (const lead of leads) if (lead.STATUS_SEMANTIC_ID === 'P' && ids.has(String(lead.ID))) active.push({ ...lead, ID: String(lead.ID) });
    }
    return active;
  }
  async createLead(fields: BitrixLeadFields): Promise<string> {
    const id = await this.call<unknown>('crm.lead.add', { fields }, false);
    if (!/^[1-9]\d*$/.test(String(id))) throw new Error('Bitrix24 không trả Lead ID hợp lệ');
    return String(id);
  }
  async updateLead(id: string, fields: BitrixLeadFields): Promise<void> {
    const result = await this.call<boolean>('crm.lead.update', { id, fields });
    if (result !== true) throw new Error(`Không cập nhật được Lead ID ${id}`);
  }
}
