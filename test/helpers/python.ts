import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Write `content` to a temp file and run a python snippet with the path as sys.argv[1]; returns parsed JSON stdout. */
export function runPython(script: string, content: string, ext: string): any {
  const dir = mkdtempSync(join(tmpdir(), 'gg-'));
  const file = join(dir, `file.${ext}`);
  writeFileSync(file, content);
  const r = spawnSync('python3', ['-c', script, file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`python failed: ${r.stderr}`);
  return JSON.parse(r.stdout.trim().split('\n').pop()!);
}
