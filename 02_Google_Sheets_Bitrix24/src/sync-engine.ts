import type { BitrixClient } from './bitrix-client.js';
import { safeError } from './reliability.js';
import type { Journal } from './state.js';
import { buildBitrixFields, validateLead } from './mapper.js';
import { makeSyncHash, normalizeEmail, normalizePhone } from './normalizers.js';
import type {
  BitrixLeadFields,
  MappingConfig,
  SheetLead,
  SyncOutcome,
  SyncWriteback,
} from './types.js';

function now(): string {
  return new Date().toISOString();
}

function failure(lead: SheetLead, reason: string, dryRun: boolean): SyncOutcome {
  return {
    action: 'error',
    message: `Lỗi: ${reason}`,
    ...(dryRun
      ? {}
      : {
          writeback: {
            rowNumber: lead.rowNumber,
            syncStatus: 'Lỗi',
            leadId: lead.leadId,
            lastSyncedAt: lead.lastSyncedAt,
            syncError: reason,
            syncHash: lead.syncHash,
          },
        }),
  };
}

function success(
  action: 'created' | 'updated',
  lead: SheetLead,
  leadId: string,
  hash: string,
  dryRun: boolean,
): SyncOutcome {
  const actionText = action === 'created' ? 'tạo Lead mới' : 'cập nhật Lead';

  return {
    action,
    message: dryRun
      ? `Xem trước: sẽ ${actionText}${leadId ? ` ID ${leadId}` : ''}`
      : `Đã ${actionText} ID ${leadId}`,
    ...(dryRun
      ? {}
      : {
          writeback: {
            rowNumber: lead.rowNumber,
            syncStatus: 'Đã đồng bộ',
            leadId,
            lastSyncedAt: now(),
            syncError: '',
            syncHash: hash,
          },
        }),
  };
}

export async function syncOne(
  lead: SheetLead,
  mapping: MappingConfig,
  bitrix: Pick<BitrixClient, 'getLead' | 'findPotentialDuplicates' | 'createLead' | 'updateLead'>,
  dryRun: boolean,
  journal?: Journal,
): Promise<SyncOutcome> {
  const validationError = validateLead(lead);
  if (validationError) {
    return failure(lead, validationError, dryRun);
  }

  try {
    const fields: BitrixLeadFields = buildBitrixFields(lead, mapping);
    const hash = makeSyncHash(fields);
    const key = makeSyncHash({ email: normalizeEmail(lead.email), phone: normalizePhone(lead.phone) });
    const saved = journal?.get(key);
    const linkedId = lead.leadId || saved?.id;
    if (linkedId) {
      await bitrix.getLead(linkedId);
      if (lead.leadId && lead.syncHash === hash) {
        const repair = lead.syncStatus !== 'Đã đồng bộ' || !!lead.syncError;
        return {
          action: 'skipped', message: `Bỏ qua Lead ID ${linkedId}: dữ liệu nghiệp vụ không thay đổi`,
          ...(repair && !dryRun ? { writeback: { rowNumber: lead.rowNumber, syncStatus: 'Đã đồng bộ',
            leadId: linkedId, lastSyncedAt: lead.lastSyncedAt, syncError: '', syncHash: hash } } : {}),
        };
      }
      if (!dryRun) await bitrix.updateLead(linkedId, fields);
      return success('updated', lead, linkedId, hash, dryRun);
    }

    const matches = await bitrix.findPotentialDuplicates(
      normalizeEmail(lead.email),
      normalizePhone(lead.phone),
    );

    if (matches.length > 1) {
      const ids = matches.map((match) => match.ID).join(', ');
      return failure(lead, `xung đột chống trùng: tìm thấy nhiều Lead (${ids})`, dryRun);
    }

    const existingLead = matches[0];
    if (existingLead) {
      if (!dryRun) {
        await bitrix.updateLead(existingLead.ID, fields);
      }
      return success('updated', lead, existingLead.ID, hash, dryRun);
    }

    if (saved?.pending) return failure(lead, 'Lần tạo trước chưa rõ kết quả. Kiểm tra CRM và state journal trước khi thử lại.', dryRun);

    if (dryRun) {
      return success('created', lead, '', hash, true);
    }

    journal?.set(key, { pending: true });
    const createdLeadId = await bitrix.createLead(fields);
    journal?.set(key, { id: createdLeadId });
    return success('created', lead, createdLeadId, hash, false);
  } catch (error) {
    return failure(lead, safeError(error), dryRun);
  }
}
