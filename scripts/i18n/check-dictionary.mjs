#!/usr/bin/env node
// ============================================================
// يتحقق أن كل نص عربي معروض له ترجمة إنجليزية — أي "تسريب" يفشل الفحص.
// Fails if any displayed Arabic string has no English translation.
//
//   node scripts/i18n/check-dictionary.mjs
//
// يفحص أيضاً تطابق المعاملات {0} والمسافات الطرفية بين المفتاح والترجمة.
// ============================================================
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { extractKeys } from './extract-keys.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

// نصوص تبقى كما هي في اللغتين (جداول أرقام، محارف تنسيق).
const IDENTITY_ALLOWED = new Set(['٠١٢٣٤٥٦٧٨٩', '۰۱۲۳۴۵۶۷۸۹', '﻿']);

const dictionaryUrl = pathToFileURL(path.join(ROOT, 'packages/shared-i18n/src/dictionary/en.ts'));

// القاموس ملف TypeScript، لذا نقرأه نصياً ونستخرج الأزواج بأمان عبر JSON.
import fs from 'fs';
const source = fs.readFileSync(fileURLToPath(dictionaryUrl), 'utf8');
const body = source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1);
const pairs = new Map();
for (const match of body.matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")\s*,\s*$/gm)) {
  pairs.set(JSON.parse(match[1]), JSON.parse(match[2]));
}

const keys = extractKeys();
const problems = [];

for (const [key, file] of keys) {
  if (!pairs.has(key)) {
    problems.push(`MISSING     ${file}  ${JSON.stringify(key)}`);
    continue;
  }
  const value = pairs.get(key);
  if (IDENTITY_ALLOWED.has(key)) continue;
  if (!value.trim()) problems.push(`EMPTY       ${JSON.stringify(key)}`);
  if (ARABIC.test(value)) problems.push(`UNTRANSLATED ${JSON.stringify(key)} -> ${JSON.stringify(value)}`);

  const keyParams = (key.match(/\{\d+\}/g) ?? []).sort().join(',');
  const valueParams = (value.match(/\{\d+\}/g) ?? []).sort().join(',');
  if (keyParams !== valueParams) {
    problems.push(`PLACEHOLDER ${JSON.stringify(key)} [${keyParams}] -> ${JSON.stringify(value)} [${valueParams}]`);
  }
  if (/^\s/.test(key) !== /^\s/.test(value)) problems.push(`LEADSPACE   ${JSON.stringify(key)} -> ${JSON.stringify(value)}`);
  if (/\s$/.test(key) !== /\s$/.test(value)) problems.push(`TRAILSPACE  ${JSON.stringify(key)} -> ${JSON.stringify(value)}`);
}

const orphans = [...pairs.keys()].filter((key) => !keys.has(key));

problems.forEach((line) => console.log(line));
console.log(`\ntranslatable strings: ${keys.size}`);
console.log(`dictionary entries:   ${pairs.size}`);
console.log(`unused entries:       ${orphans.length}`);
console.log(`problems:             ${problems.length}`);

if (problems.length) {
  console.error('\n✗ dictionary check failed');
  process.exit(1);
}
console.log('\n✓ every displayed Arabic string has an English translation');
