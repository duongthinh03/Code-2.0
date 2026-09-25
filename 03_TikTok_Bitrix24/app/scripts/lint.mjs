import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function tsFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return tsFiles(path);
      return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
    }),
  );
  return nested.flat();
}

const files = [...(await tsFiles('src')), ...(await tsFiles('test'))];
const result = spawnSync(
  process.execPath,
  ['node_modules/oxlint/bin/oxlint', '--no-ignore', ...files],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
