const rawWebhookUrl = process.env.BITRIX_WEBHOOK_URL?.trim();

function webhookBaseUrl(value) {
  if (!value) throw new Error('BITRIX_WEBHOOK_URL is missing from .env');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('BITRIX_WEBHOOK_URL is not a valid URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !/^\/rest\/\d+\/[^/]+\/$/.test(url.pathname)) {
    throw new Error('BITRIX_WEBHOOK_URL must be the HTTPS webhook base URL ending in /rest/<user>/<secret>/');
  }
  return url;
}

async function readCrm(baseUrl, method, parameters) {
  const endpoint = new URL(`${method}.json`, baseUrl);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(parameters),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(`${method}: connection failed or timed out`);
  }
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${method}: response is not JSON`);
  }
  if (body.error) {
    const code = typeof body.error === 'string' && /^[A-Z0-9_]+$/.test(body.error)
      ? body.error : 'API_ERROR';
    throw new Error(`${method}: Bitrix24 returned ${code}`);
  }
  return body.result;
}

try {
  const baseUrl = webhookBaseUrl(rawWebhookUrl);
  const categories = await readCrm(baseUrl, 'crm.category.list', { entityTypeId: 2 });
  if (!Array.isArray(categories?.categories)) {
    throw new Error('crm.category.list: unexpected response format');
  }
  const pipeline = categories.categories.find((item) => item.isDefault === 'Y');
  if (!pipeline || !Number.isInteger(Number(pipeline.id))) {
    throw new Error('crm.category.list: no default Deal pipeline found');
  }
  const statusType = Number(pipeline.id) === 0 ? 'DEAL_STAGE' : `DEAL_STAGE_${pipeline.id}`;
  const stages = await readCrm(baseUrl, 'crm.status.list', { filter: { ENTITY_ID: statusType } });
  if (!Array.isArray(stages)) throw new Error('crm.status.list: unexpected response format');
  const stageIds = new Set(stages.map((item) => item.STATUS_ID));
  for (const required of ['NEW', 'WON', 'LOSE']) {
    if (!stageIds.has(required)) throw new Error(`crm.status.list: required stage ${required} is missing`);
  }
  console.log('Bitrix24 read-only connection: OK');
  console.log(`Default Deal pipeline ID: ${pipeline.id}`);
  console.log('Deal stages: NEW, WON, LOSE');
  console.log('No CRM records were created or changed.');
} catch (error) {
  console.error(`Bitrix24 check failed: ${error.message}`);
  process.exitCode = 1;
}
