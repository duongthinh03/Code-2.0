import { normalizeEmail, normalizePhone } from './identity';
import { MockLeadInput } from './mock-bitrix.client';

export const mappingFields = [
  'externalLeadId', 'fullName', 'email', 'phone', 'campaignId', 'campaignName',
  'adId', 'formId', 'city', 'ttclid',
] as const;
export type MappingField = typeof mappingFields[number];
export type LeadMappings = Record<MappingField, string> & { customFields?: Record<string, string> };

export const defaultMappings: LeadMappings = {
  externalLeadId: 'data.lead_id', fullName: 'data.full_name',
  email: 'data.email', phone: 'data.phone', campaignId: 'data.campaign_id',
  campaignName: 'data.campaign_name',
  adId: 'data.ad_id', formId: 'data.form_id', city: 'data.city', ttclid: 'data.ttclid',
};

export function validateMappings(value: unknown): LeadMappings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Mappings must be an object');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'customFields' && !mappingFields.includes(key as MappingField))) {
    throw new Error('Unknown mapping field');
  }
  const mappings = { ...defaultMappings };
  for (const field of mappingFields) {
    const path = input[field];
    if (path === undefined) continue;
    if (typeof path !== 'string' || path.length > 128 ||
        !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*){0,3}$/.test(path) ||
        path.split('.').some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))) {
      throw new Error(`Invalid mapping path for ${field}`);
    }
    mappings[field] = path;
  }
  if (input.customFields !== undefined) {
    if (!input.customFields || typeof input.customFields !== 'object' || Array.isArray(input.customFields) ||
        Object.keys(input.customFields).length > 20) throw new Error('Invalid custom fields');
    mappings.customFields = {};
    for (const [key, path] of Object.entries(input.customFields as Record<string, unknown>)) {
      if (!/^UF_CRM_[A-Z0-9_]{1,64}$/.test(key) || typeof path !== 'string' || path.length > 128 ||
          !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*){0,3}$/.test(path) ||
          path.split('.').some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))) {
        throw new Error(`Invalid custom field mapping for ${key}`);
      }
      mappings.customFields[key] = path;
    }
  }
  return mappings;
}

function atPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function clean(value: unknown, max = 255): string | null {
  if (typeof value !== 'string') return null;
  const result = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('').trim();
  if (result.length > max) throw new Error(`Field exceeds ${max} characters`);
  return result || null;
}

export function mapLeadPayload(payload: unknown, mappings: LeadMappings): MockLeadInput {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid stored payload');
  const event = payload as Record<string, unknown>;
  const get = (field: MappingField) => {
    const path = mappings[field];
    const mapped = atPath(event, path);
    if (mapped !== undefined && mapped !== null) return mapped;
    if (path.startsWith('data.')) {
      const alternate = atPath(event, `lead_data.${path.slice(5)}`);
      if (alternate !== undefined) return alternate;
    }
    if (field === 'campaignId') return atPath(event, 'campaign.campaign_id');
    if (field === 'campaignName') return atPath(event, 'campaign.campaign_name');
    if (field === 'adId') return atPath(event, 'campaign.ad_id');
    if (field === 'formId') return atPath(event, 'form.form_id');
    return undefined;
  };
  const externalLeadId = clean(get('externalLeadId'), 128) ?? clean(event.event_id, 128);
  if (!externalLeadId) throw new Error('Missing external Lead ID');
  const originalEmail = clean(get('email'), 254);
  const originalPhone = clean(get('phone'), 50);
  const email = normalizeEmail(originalEmail);
  const phone = normalizePhone(originalPhone);
  if (originalEmail && !email) throw new Error('Invalid email');
  if (originalPhone && !phone) throw new Error('Invalid phone');
  if (!email && !phone) throw new Error('Lead requires email or phone');
  const customFields: Record<string, string | number | boolean> = {};
  for (const [key, path] of Object.entries(mappings.customFields ?? {})) {
    const value = atPath(event, path);
    if (typeof value === 'string') {
      const cleaned = clean(value);
      if (cleaned) customFields[key] = cleaned;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      customFields[key] = value;
    } else if (typeof value === 'boolean') {
      customFields[key] = value;
    }
  }
  return {
    externalLeadId,
    fullName: clean(get('fullName')),
    email,
    phone,
    campaignId: clean(get('campaignId'), 128),
    campaignName: clean(get('campaignName'), 255),
    adId: clean(get('adId'), 128),
    formId: clean(get('formId'), 128),
    city: clean(get('city')),
    ttclid: clean(get('ttclid'), 255),
    rawData: payload,
    customFields,
  };
}
