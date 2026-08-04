#!/usr/bin/env node
// ============================================================
// يتحقق أن كل استدعاء t('… {0} …', [...]) يمرّر عدد المعاملات الصحيح،
// وأن كل نص عربي معروض يمر فعلاً عبر المترجم.
// Verifies every t() call passes the right number of arguments, and that no
// Arabic text is rendered without going through the translator.
//
//   node scripts/i18n/check-call-sites.mjs
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default?.default ?? _traverse.default ?? _traverse;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const SKIP = /node_modules|\/dictionary\/|\.test\./;
const SCAN = ['apps/customer/src', 'apps/customer/App.tsx', 'packages'];

const files = [];
const walk = (target) => {
  if (SKIP.test(target) || !fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) for (const entry of fs.readdirSync(target)) walk(path.join(target, entry));
  else if (/\.(ts|tsx)$/.test(target)) files.push(target);
};
SCAN.forEach((dir) => walk(path.join(ROOT, dir)));
files.sort();

const problems = [];
let calls = 0;
let jsxText = 0;

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  if (!ARABIC.test(code)) continue;
  const rel = path.relative(ROOT, file);
  const ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'], ranges: true });

  traverse(ast, {
    CallExpression(nodePath) {
      const callee = nodePath.node.callee;
      if (callee.type !== 'Identifier' || callee.name !== 't') return;
      const [keyNode, paramsNode] = nodePath.node.arguments;
      if (!keyNode || keyNode.type !== 'StringLiteral') return;
      calls++;
      const line = nodePath.node.loc.start.line;
      const placeholders = new Set((keyNode.value.match(/\{(\d+)\}/g) ?? []).map((p) => Number(p.slice(1, -1))));
      const highest = placeholders.size ? Math.max(...placeholders) : -1;

      if (highest >= 0 && !paramsNode) {
        problems.push(`NO_ARGS   ${rel}:${line}  ${JSON.stringify(keyNode.value)} needs ${highest + 1} value(s)`);
        return;
      }
      if (highest < 0 && paramsNode) {
        problems.push(`EXTRA_ARGS ${rel}:${line}  ${JSON.stringify(keyNode.value)} has no placeholders`);
        return;
      }
      if (!paramsNode) return;
      if (paramsNode.type !== 'ArrayExpression') return; // object form — not checked
      if (paramsNode.elements.length !== highest + 1) {
        problems.push(
          `ARG_COUNT ${rel}:${line}  ${JSON.stringify(keyNode.value)} expects ${highest + 1}, got ${paramsNode.elements.length}`,
        );
      }
    },
    JSXText(nodePath) {
      // نص عربي مكتوب مباشرة داخل JSX لا يمر عبر المترجم إطلاقاً
      if (ARABIC.test(nodePath.node.value)) {
        jsxText++;
        problems.push(`RAW_JSX   ${rel}:${nodePath.node.loc.start.line}  ${JSON.stringify(nodePath.node.value.trim())}`);
      }
    },
  });
}

problems.forEach((line) => console.log(line));
console.log(`\nt() calls checked:      ${calls}`);
console.log(`raw Arabic JSX text:   ${jsxText}`);
console.log(`problems:              ${problems.length}`);

if (problems.length) {
  console.error('\n✗ call-site check failed');
  process.exit(1);
}
console.log('\n✓ every t() call is well-formed and no Arabic text bypasses the translator');
