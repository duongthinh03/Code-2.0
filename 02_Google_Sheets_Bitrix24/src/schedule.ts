import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const minutes = Number(process.env.SYNC_INTERVAL_MINUTES ?? 15);
if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) throw new Error('SYNC_INTERVAL_MINUTES phải từ 1 đến 1440');
let stopped = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let child: ReturnType<typeof spawn> | undefined;
function run() {
  child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./sync.ts', import.meta.url))], { stdio: 'inherit', windowsHide: true });
  child.on('error', () => console.error('Không khởi động được sync'));
  child.on('close', code => {
    console.log(`Lượt đồng bộ kết thúc: exit=${code}; chạy tiếp sau ${minutes} phút.`);
    if (!stopped) timer = setTimeout(run, minutes * 60_000);
  });
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  stopped = true;
  if (timer) clearTimeout(timer);
  // Allow the current child to finish so writeback and lock cleanup complete.
});
console.log(`Lịch đồng bộ: chạy ngay, sau đó nghỉ ${minutes} phút giữa các lượt.`);
run();
