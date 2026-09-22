import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface JournalEntry { id?: string; pending?: boolean }
export interface Journal { get(key: string): JournalEntry | undefined; set(key: string, entry: JournalEntry): void }
export function acquireLock(directory: string): () => void {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, 'sync.lock');
  let fd: number;
  try { fd = openSync(file, 'wx', 0o600); }
  catch { throw new Error('Đang có lượt đồng bộ khác hoặc còn sync.lock từ lần bị dừng. Xem README.'); }
  writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  return () => { closeSync(fd); unlinkSync(file); };
}
export function openJournal(directory: string): Journal {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, 'journal.json');
  const entries: Record<string, JournalEntry> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  return {
    get: key => entries[key],
    set(key, entry) {
      entries[key] = entry;
      const temp = file + '.tmp';
      writeFileSync(temp, JSON.stringify(entries, null, 2), { mode: 0o600 });
      renameSync(temp, file);
    },
  };
}
