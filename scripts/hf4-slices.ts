/** Compare unchanged30-minute world work with smaller public HF until horizons.
 * This is a bounded Node diagnostic, not a browser frame guarantee or long-season proof.
 * node scripts/hf4-slices.ts [60000,10000,1000]
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'warren-hf4-slices-'));
const sizes = (process.argv[2] ?? '60000,10000,1000').split(',').map(Number);
if (sizes.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 60000))
  throw Error('Invalid slice milliseconds');
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
try {
  symlinkSync(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir');
  writeFileSync(join(temporary, 'package.json'), JSON.stringify({ type: 'module' }));
  cpSync(join(root, 'src/sim'), join(temporary, 'source/sim'), { recursive: true });
  writeFileSync(
    join(temporary, 'baseline.ts'),
    `import { advance,newGame,save } from './source/sim/game.ts';\nimport { writeFileSync } from 'node:fs';\nconst g=newGame(7,'0.7.0',undefined,'warren-rest/1');advance(g,1020);writeFileSync(new URL('./baseline.json',import.meta.url),JSON.stringify(save(g)));`,
  );
  execFileSync(process.execPath, [join(temporary, 'baseline.ts')], { timeout: 120000 });
  const results = [];
  for (const sliceMs of sizes) {
    const folder = join(temporary, `slice-${sliceMs}`);
    cpSync(join(root, 'src/sim'), join(folder, 'sim'), { recursive: true });
    const file = join(folder, 'sim/hf4.ts');
    const original = readFileSync(file, 'utf8');
    const changed = original
      .replace(
        'Math.floor(at / MINUTE) * MINUTE + MINUTE',
        `Math.floor(at / ${sliceMs}) * ${sliceMs} + ${sliceMs}`,
      )
      .replace('target + MINUTE', `target + ${sliceMs}`);
    if (changed === original && sliceMs !== 60000) throw Error('Step horizon substitution failed');
    writeFileSync(file, changed);
    writeFileSync(
      join(folder, 'workload.ts'),
      `
import { readFileSync } from 'node:fs';
import { advance,load,save } from './sim/game.ts';
import { observeSteps } from './sim/hf4.ts';
const game=load(JSON.parse(readFileSync(new URL('../baseline.json',import.meta.url),'utf8')));
const samples=[];const stop=observeSteps(s=>samples.push(s));
const start=performance.now();advance(game,1110);const elapsedMs=performance.now()-start;stop();
const exported=performance.now(),saved=save(game),json=JSON.stringify(saved);
console.log(JSON.stringify({sliceMs:${sliceMs},elapsedMs,exportMs:performance.now()-exported,archiveBytes:Buffer.byteLength(json),transactions:saved.state.hf.history.length,samples}));`,
    );
    const measured = JSON.parse(
      execFileSync(process.execPath, [join(folder, 'workload.ts')], { encoding: 'utf8', timeout: 120000 }),
    );
    const samples = measured.samples.slice(30);
    const cpu = samples.map((s: { cpuMs: number }) => s.cpuMs),
      wall = samples.map((s: { wallMs: number }) => s.wallMs);
    delete measured.samples;
    results.push({
      ...measured,
      warmedSamples: samples.length,
      wallP95: percentile(wall, 0.95),
      wallMax: Math.max(...wall),
      cpuP95: percentile(cpu, 0.95),
      cpuMax: Math.max(...cpu),
      overBudgetCpu: cpu.filter((n: number) => n > 10).length,
    });
  }
  console.log(
    JSON.stringify(
      {
        scope:
          'same authored12-hour checkpoint, next90minutes, six people, unchanged30-minute physical cadence; all calls retained, first30 excluded from percentiles',
        package: JSON.parse(
          readFileSync(join(root, 'node_modules/@adam0white/human-framework/package.json'), 'utf8'),
        ).version,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
