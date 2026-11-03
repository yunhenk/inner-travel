import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  distanceToHandBody,
  parseMeridian,
  resolveAnchor,
  type Acupoint,
} from '@inner/core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contentDir = path.join(root, 'content/meridians');
const publish = process.argv.includes('--publish');

interface Issue {
  code: string;
  message: string;
  level: 'error' | 'warning';
}

const issues: Issue[] = [];

function checkAnchor(point: Acupoint): void {
  if (point.anchorStatus !== 'authored') return;
  if (point.anchor.frame !== 'hand.R' && point.anchor.frame !== 'forearm.R') return;
  const world = resolveAnchor(point);
  const error = Math.abs(distanceToHandBody(world));
  if (error > 0.0006) {
    issues.push({
      code: point.code,
      level: 'error',
      message: `锚点离体表 ${(error * 1000).toFixed(2)}mm（阈值 0.6mm）`,
    });
  }
}

async function main(): Promise<void> {
  const files = (await readdir(contentDir)).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) {
    console.error('content/meridians 下没有经脉文件');
    process.exit(1);
  }

  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(contentDir, file), 'utf8')) as unknown;
    const meridian = parseMeridian(raw);
    const authored = meridian.points.filter((p) => p.anchorStatus === 'authored');
    const placeholders = meridian.points.filter((p) => p.anchorStatus !== 'authored');
    console.log(
      `\n${meridian.name}（${meridian.id}） · ${meridian.points.length} 穴 · 已标定 ${authored.length} · 占位 ${placeholders.length}`,
    );

    for (const point of authored) checkAnchor(point);

    if (placeholders.length > 0) {
      const list = placeholders.map((p) => p.code).join(' ');
      issues.push({
        code: meridian.id,
        level: publish ? 'error' : 'warning',
        message: `${placeholders.length} 个穴位仍是占位锚点：${list}`,
      });
    }

    const stages = meridian.points.filter((p) => p.wushu).map((p) => `${p.code}=${p.wushu!.stage}`);
    console.log(`五输：${stages.join(' ')}`);
    if (meridian.schedule.startHour >= meridian.schedule.endHour) {
      issues.push({
        code: meridian.id,
        level: 'error',
        message: 'schedule.startHour 必须小于 endHour（跨午夜经另行建模）',
      });
    }
  }

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  for (const issue of warnings) console.warn(`  ⚠ ${issue.code}: ${issue.message}`);
  for (const issue of errors) console.error(`  ✗ ${issue.code}: ${issue.message}`);

  console.log(
    `\n校验完成：${files.length} 个文件，${errors.length} 个错误，${warnings.length} 个警告${publish ? '（发布模式）' : ''}`,
  );
  if (errors.length > 0) process.exit(1);
}

await main();
