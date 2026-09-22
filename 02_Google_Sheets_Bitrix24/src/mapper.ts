import { isValidEmail, normalizeEmail, normalizePhone, normalizeText, parseBudget } from './normalizers.js';
import type { BitrixLeadFields, BusinessKey, MappingConfig, SheetLead } from './types.js';

function businessValues(lead: SheetLead): Record<BusinessKey, string> {
  return {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    utmSource: lead.utmSource,
    budget: lead.budget,
    leadStatus: lead.leadStatus,
    assignee: lead.assignee,
    notes: lead.notes,
  };
}

function applyTemplate(template: string, lead: SheetLead): string {
  const values = businessValues(lead);
  return template.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (_, key: string) => {
    return key in values ? values[key as BusinessKey] : '';
  });
}

export function validateLead(lead: SheetLead): string | undefined {
  const problems: string[] = [];
  const email = normalizeEmail(lead.email);
  const phone = normalizePhone(lead.phone);

  if (!normalizeText(lead.name)) {
    problems.push('thiếu Tên');
  }

  if (!email && !phone) {
    problems.push('cần có Email hoặc Điện thoại để chống trùng');
  }

  if (email && !isValidEmail(email)) {
    problems.push('Email không hợp lệ');
  }

  if (lead.budget.trim() && parseBudget(lead.budget) === undefined) {
    problems.push('Ngân sách dự kiến phải là số');
  }

  return problems.length > 0 ? problems.join('; ') : undefined;
}

export function buildBitrixFields(
  lead: SheetLead,
  mapping: MappingConfig,
): BitrixLeadFields {
  const fields: BitrixLeadFields = {};
  const values = businessValues(lead);

  for (const key of Object.keys(mapping.bitrix.fieldMap) as BusinessKey[]) {
    const bitrixField = mapping.bitrix.fieldMap[key];
    const rawValue = values[key];

    if (!bitrixField || !rawValue.trim()) {
      continue;
    }

    fields[bitrixField] = key === 'budget' ? parseBudget(rawValue) : normalizeText(rawValue);
  }

  const statusField = mapping.bitrix.fieldMap.leadStatus ?? 'STATUS_ID';
  if (!lead.leadStatus.trim() && mapping.bitrix.defaultStatusId.trim()) {
    fields[statusField] = mapping.bitrix.defaultStatusId;
  }

  const title = normalizeText(applyTemplate(mapping.bitrix.titleTemplate, lead));
  fields.TITLE = title || 'Lead từ Google Sheets';

  const email = normalizeEmail(lead.email);
  if (email) {
    fields[mapping.bitrix.email.field] = [
      { VALUE: email, VALUE_TYPE: mapping.bitrix.email.valueType },
    ];
  }

  const phone = normalizePhone(lead.phone);
  if (phone) {
    fields[mapping.bitrix.phone.field] = [
      { VALUE: phone, VALUE_TYPE: mapping.bitrix.phone.valueType },
    ];
  }

  if (mapping.bitrix.currencyId?.trim() && fields.OPPORTUNITY !== undefined) {
    fields.CURRENCY_ID = mapping.bitrix.currencyId;
  }

  if (mapping.bitrix.sourceId?.trim()) {
    fields.SOURCE_ID = mapping.bitrix.sourceId;
  }

  const assigneeId = mapping.bitrix.assigneeIdMap[lead.assignee];
  if (assigneeId) {
    fields.ASSIGNED_BY_ID = assigneeId;
  }

  for (const [sheetHeader, bitrixField] of Object.entries(mapping.bitrix.customFieldMap)) {
    const value = lead.source[sheetHeader]?.trim();
    if (value) {
      fields[bitrixField] = value;
    }
  }

  return fields;
}
