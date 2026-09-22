import axios from 'axios';

export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export class ApiError extends Error {
  constructor(message: string, readonly retryable = false, readonly code = '') {
    super(message);
  }
}

export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Lỗi không xác định';
  return message.replace(/https?:\/\/[^\s"'<>]+/g, '[URL đã ẩn]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [ẩn]').slice(0, 400);
}

export async function withRetry<T>(operation: () => Promise<T>, wait = sleep): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const transient = error instanceof ApiError ? error.retryable
        : status === 429 || (status !== undefined && status >= 500)
          || (axios.isAxiosError(error) && !error.response)
          || ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(String((error as { code?: string })?.code));
      if (!transient || attempt >= 2) throw error;
      const retryAfter = Number((error as { response?: { headers?: Record<string, unknown> } })?.response?.headers?.['retry-after']);
      await wait(Math.min(60_000, Math.max(500 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0)));
    }
  }
}
