#!/usr/bin/env node
// ============================================================
// يستخرج كل نص عربي يمكن أن يمر عبر t()/tv() أثناء التشغيل.
// Extracts every Arabic string that can reach the translator at runtime.
//
// الاستخدام / usage:
//   node scripts/i18n/extract-keys.mjs            # يطبع عدد المفاتيح
//   node scripts/i18n/extract-keys.mjs --json     # يطبع المفاتيح مع ملفاتها
//
// المفتاح هو النص العربي نفسه، لذلك لا تُكتب المفاتيح يدوياً أبداً.
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default?.default ?? _traverse.default ?? _traverse;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

// القاموس نفسه يحتوي كل النصوص العربية، لذلك يُستثنى من المسح.
const SKIP = /node_modules|\/dictionary\/|\.test\.|\.d\.ts$/;
const SCAN_DIRS = [
  'apps/customer/src',
  'apps/customer/App.tsx',
  'packages/shared-hooks',
  'packages/shared-ui',
  'packages/shared-utils',
  'packages/shared-i18n/src/components',
];

const collectFiles = () => {
  const files = [];
  const walk = (target) => {
    if (SKIP.test(target) || !fs.existsSync(target)) return;
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target)) walk(path.join(target, entry));
    } else if (/\.(ts|tsx)$/.test(target)) {
      files.push(target);
    }
  };
  SCAN_DIRS.forEach((dir) => walk(path.join(ROOT, dir)));
  return files.sort();
};

export const extractKeys = () => {
  const keys = new Map(); // key -> first file it appears in
  for (const file of collectFiles()) {
    const code = fs.readFileSync(file, 'utf8');
    if (!ARABIC.test(code)) continue;
    const ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'], ranges: true });
    const rel = path.relative(ROOT, file);
    traverse(ast, {
      StringLiteral(nodePath) {
        const value = nodePath.node.value;
        if (!ARABIC.test(value)) return;
        // اسم خاصية الكائن لا يُعرض للمستخدم أبداً
        const parent = nodePath.parent;
        if (parent.type === 'ObjectProperty' && parent.key === nodePath.node && !parent.computed) return;
        if (parent.type === 'TSLiteralType') return;
        if (!keys.has(value)) keys.set(value, rel);
      },
    });
  }
  return keys;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const keys = extractKeys();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify([...keys].map(([key, file]) => ({ key, file })), null, 1) + '\n');
  } else {
    console.log(`unique translatable strings: ${keys.size}`);
  }
}
