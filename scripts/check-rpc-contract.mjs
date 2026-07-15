import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const root = process.cwd();
const sourceRoots = [
  'apps/customer/src',
  'packages/shared-hooks/src',
  'supabase/functions',
];
const migrationRoot = path.join(root, 'supabase', 'migrations');

async function walk(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath, extensions));
    else if (extensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

function lineAt(sourceFile, position) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function staticPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) {
    return name.expression.text;
  }
  return null;
}

function rpcArgumentNames(call) {
  if (call.arguments.length < 2 || call.arguments[1].kind === ts.SyntaxKind.UndefinedKeyword) {
    return { names: [], dynamicReason: null };
  }

  const args = call.arguments[1];
  if (!ts.isObjectLiteralExpression(args)) {
    return { names: [], dynamicReason: 'RPC argument payload is not an object literal' };
  }

  const names = [];
  for (const property of args.properties) {
    if (ts.isSpreadAssignment(property)) {
      return { names, dynamicReason: 'RPC argument payload contains a spread' };
    }

    if (ts.isShorthandPropertyAssignment(property)) {
      names.push(property.name.text);
      continue;
    }

    if (ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property) || ts.isGetAccessor(property) || ts.isSetAccessor(property)) {
      const name = staticPropertyName(property.name);
      if (name === null) {
        return { names, dynamicReason: 'RPC argument payload contains a computed property' };
      }
      names.push(name);
      continue;
    }

    return { names, dynamicReason: 'RPC argument payload contains an unsupported property' };
  }

  return { names, dynamicReason: null };
}

function collectRpcCalls(source, file) {
  const scriptKind = file.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : file.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : file.endsWith('.js') || file.endsWith('.mjs')
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const calls = [];

  function visit(node) {
    if (
      ts.isCallExpression(node)
      && (ts.isPropertyAccessExpression(node.expression) || ts.isPropertyAccessChain(node.expression))
      && node.expression.name.text === 'rpc'
    ) {
      const nameNode = node.arguments[0];
      if (nameNode && (ts.isStringLiteralLike(nameNode) || ts.isNoSubstitutionTemplateLiteral(nameNode))) {
        const { names, dynamicReason } = rpcArgumentNames(node);
        calls.push({
          name: nameNode.text,
          argNames: names,
          dynamicReason,
          location: `${path.relative(root, file)}:${lineAt(sourceFile, node.getStart(sourceFile))}`,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}

function maskSqlNonCode(sql) {
  // Keep UTF-16 indexes aligned with String#slice/match indexes even when comments contain emoji.
  const chars = sql.split('');
  let index = 0;
  let blockCommentDepth = 0;

  const mask = (position) => {
    if (chars[position] !== '\n' && chars[position] !== '\r') chars[position] = ' ';
  };

  while (index < sql.length) {
    if (blockCommentDepth > 0) {
      if (sql.startsWith('/*', index)) {
        mask(index);
        mask(index + 1);
        blockCommentDepth += 1;
        index += 2;
      } else if (sql.startsWith('*/', index)) {
        mask(index);
        mask(index + 1);
        blockCommentDepth -= 1;
        index += 2;
      } else {
        mask(index);
        index += 1;
      }
      continue;
    }

    if (sql.startsWith('--', index)) {
      while (index < sql.length && sql[index] !== '\n') {
        mask(index);
        index += 1;
      }
      continue;
    }

    if (sql.startsWith('/*', index)) {
      mask(index);
      mask(index + 1);
      blockCommentDepth = 1;
      index += 2;
      continue;
    }

    if (sql[index] === "'") {
      mask(index);
      index += 1;
      while (index < sql.length) {
        mask(index);
        if (sql[index] === "'" && sql[index + 1] === "'") {
          mask(index + 1);
          index += 2;
        } else if (sql[index] === "'") {
          index += 1;
          break;
        } else {
          index += 1;
        }
      }
      continue;
    }

    if (sql[index] === '$') {
      const tag = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        for (let offset = 0; offset < tag.length; offset += 1) mask(index + offset);
        index += tag.length;
        const end = sql.indexOf(tag, index);
        const stop = end === -1 ? sql.length : end + tag.length;
        while (index < stop) {
          mask(index);
          index += 1;
        }
        continue;
      }
    }

    index += 1;
  }

  return chars.join('');
}

function findMatchingParen(sql, openIndex) {
  let depth = 0;
  let index = openIndex;
  let quote = null;
  let blockCommentDepth = 0;

  while (index < sql.length) {
    if (blockCommentDepth > 0) {
      if (sql.startsWith('/*', index)) {
        blockCommentDepth += 1;
        index += 2;
      } else if (sql.startsWith('*/', index)) {
        blockCommentDepth -= 1;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    if (quote === "'") {
      if (sql[index] === "'" && sql[index + 1] === "'") index += 2;
      else if (sql[index] === "'") {
        quote = null;
        index += 1;
      } else index += 1;
      continue;
    }

    if (quote === '"') {
      if (sql[index] === '"' && sql[index + 1] === '"') index += 2;
      else if (sql[index] === '"') {
        quote = null;
        index += 1;
      } else index += 1;
      continue;
    }

    if (quote?.startsWith('$')) {
      if (sql.startsWith(quote, index)) {
        index += quote.length;
        quote = null;
      } else index += 1;
      continue;
    }

    if (sql.startsWith('--', index)) {
      const newline = sql.indexOf('\n', index + 2);
      index = newline === -1 ? sql.length : newline + 1;
      continue;
    }
    if (sql.startsWith('/*', index)) {
      blockCommentDepth = 1;
      index += 2;
      continue;
    }
    if (sql[index] === "'" || sql[index] === '"') {
      quote = sql[index];
      index += 1;
      continue;
    }
    if (sql[index] === '$') {
      const tag = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        quote = tag;
        index += tag.length;
        continue;
      }
    }
    if (sql[index] === '(') depth += 1;
    if (sql[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }

  return -1;
}

function splitSqlArguments(argumentList) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let index = 0;
  let quote = null;

  while (index < argumentList.length) {
    if (quote === "'") {
      if (argumentList[index] === "'" && argumentList[index + 1] === "'") index += 2;
      else if (argumentList[index] === "'") {
        quote = null;
        index += 1;
      } else index += 1;
      continue;
    }
    if (quote === '"') {
      if (argumentList[index] === '"' && argumentList[index + 1] === '"') index += 2;
      else if (argumentList[index] === '"') {
        quote = null;
        index += 1;
      } else index += 1;
      continue;
    }
    if (quote?.startsWith('$')) {
      if (argumentList.startsWith(quote, index)) {
        index += quote.length;
        quote = null;
      } else index += 1;
      continue;
    }

    if (argumentList.startsWith('--', index)) {
      const newline = argumentList.indexOf('\n', index + 2);
      index = newline === -1 ? argumentList.length : newline + 1;
      continue;
    }
    if (argumentList.startsWith('/*', index)) {
      const end = argumentList.indexOf('*/', index + 2);
      index = end === -1 ? argumentList.length : end + 2;
      continue;
    }
    if (argumentList[index] === "'" || argumentList[index] === '"') {
      quote = argumentList[index];
      index += 1;
      continue;
    }
    if (argumentList[index] === '$') {
      const tag = argumentList.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        quote = tag;
        index += tag.length;
        continue;
      }
    }
    if ('([{'.includes(argumentList[index])) depth += 1;
    else if (')]}'.includes(argumentList[index])) depth -= 1;
    else if (argumentList[index] === ',' && depth === 0) {
      parts.push(argumentList.slice(start, index));
      start = index + 1;
    }
    index += 1;
  }

  if (argumentList.slice(start).trim()) parts.push(argumentList.slice(start));
  return parts;
}

function removeTopLevelDefault(argument) {
  let depth = 0;
  let quote = null;
  for (let index = 0; index < argument.length; index += 1) {
    const char = argument[index];
    if (quote === "'") {
      if (char === "'" && argument[index + 1] === "'") index += 1;
      else if (char === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (char === '"' && argument[index + 1] === '"') index += 1;
      else if (char === '"') quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    if (depth !== 0) continue;

    if (char === '=') return argument.slice(0, index).trim();
    const remainder = argument.slice(index);
    const defaultMatch = remainder.match(/^\s+default\b/i);
    if (defaultMatch) return argument.slice(0, index).trim();
  }
  return argument.trim();
}

function parseSqlArgument(argument) {
  let declaration = removeTopLevelDefault(argument.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ').trim());
  let mode = 'in';
  const modeMatch = declaration.match(/^(inout|in|out|variadic)\b\s*/i);
  if (modeMatch) {
    mode = modeMatch[1].toLowerCase();
    declaration = declaration.slice(modeMatch[0].length).trim();
  }

  const firstToken = declaration.match(/^(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_$]*))(?=\s|$)/);
  const token = firstToken ? (firstToken[1]?.replace(/""/g, '"') ?? firstToken[2]) : null;
  const remainder = firstToken ? declaration.slice(firstToken[0].length).trim() : '';
  const unnamedTypeStarters = new Set([
    'bigint', 'bigserial', 'bit', 'bool', 'boolean', 'box', 'bytea', 'char', 'character',
    'cidr', 'circle', 'date', 'decimal', 'double', 'float4', 'float8', 'inet', 'int',
    'int2', 'int4', 'int8', 'integer', 'interval', 'json', 'jsonb', 'line', 'lseg',
    'macaddr', 'macaddr8', 'money', 'numeric', 'path', 'pg_lsn', 'pg_snapshot', 'point',
    'polygon', 'real', 'record', 'serial', 'smallint', 'smallserial', 'text', 'time',
    'timestamp', 'tsquery', 'tsvector', 'txid_snapshot', 'uuid', 'varbit', 'varchar',
    'void', 'xml',
  ]);
  const hasName = Boolean(
    token
    && remainder
    && (firstToken[1] !== undefined || !unnamedTypeStarters.has(token.toLowerCase())),
  );
  const name = hasName ? token.toLowerCase() : null;
  const type = (hasName ? remainder : declaration).replace(/\s+/g, ' ').trim().toLowerCase();

  return {
    input: mode !== 'out',
    name,
    type,
  };
}

function collectFunctionDefinitions(sql, file) {
  const masked = maskSqlNonCode(sql);
  const regex = /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\s*\.\s*)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\s*\(/gi;
  const definitions = [];

  for (const match of masked.matchAll(regex)) {
    const schema = (match[1] ?? match[2] ?? 'public').toLowerCase();
    if (schema !== 'public') continue;
    const name = (match[3] ?? match[4]).toLowerCase();
    const openIndex = match.index + match[0].lastIndexOf('(');
    const closeIndex = findMatchingParen(sql, openIndex);
    if (closeIndex === -1) continue;
    const args = splitSqlArguments(sql.slice(openIndex + 1, closeIndex))
      .map(parseSqlArgument)
      .filter((arg) => arg.input);
    definitions.push({
      name,
      argNames: args.map((arg) => arg.name),
      argTypes: args.map((arg) => arg.type),
      location: `${path.relative(root, file)}:${sql.slice(0, match.index).split(/\r?\n/).length}`,
    });
  }

  return definitions;
}

function sameNamedArguments(callNames, definitionNames) {
  if (callNames.length !== definitionNames.length) return false;
  if (definitionNames.some((name) => name === null)) return false;
  const callSet = new Set(callNames.map((name) => name.toLowerCase()));
  const definitionSet = new Set(definitionNames);
  return callSet.size === callNames.length
    && definitionSet.size === definitionNames.length
    && [...callSet].every((name) => definitionSet.has(name));
}

function formatArguments(names) {
  return names.length ? `{ ${names.map((name) => name ?? '<unnamed>').join(', ')} }` : '{}';
}

const calls = [];
for (const relativeRoot of sourceRoots) {
  const directory = path.join(root, relativeRoot);
  const files = await walk(directory, new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']));
  for (const file of files) {
    calls.push(...collectRpcCalls(await readFile(file, 'utf8'), file));
  }
}

const definitionsByName = new Map();
const migrationFiles = (await walk(migrationRoot, new Set(['.sql']))).sort();
for (const file of migrationFiles) {
  const definitions = collectFunctionDefinitions(await readFile(file, 'utf8'), file);
  for (const definition of definitions) {
    const definitionsForName = definitionsByName.get(definition.name) ?? [];
    definitionsForName.push(definition);
    definitionsByName.set(definition.name, definitionsForName);
  }
}

const missing = [];
const mismatched = [];
const dynamic = [];
for (const call of calls) {
  if (call.dynamicReason) {
    dynamic.push(call);
    continue;
  }
  const definitions = definitionsByName.get(call.name) ?? [];
  if (!definitions.length) {
    missing.push(call);
  } else if (!definitions.some((definition) => sameNamedArguments(call.argNames, definition.argNames))) {
    mismatched.push({ call, definitions });
  }
}

if (missing.length) {
  console.error('RPCs referenced by application/Edge code but absent from local migrations:');
  for (const call of missing) console.error(`- ${call.name} ${formatArguments(call.argNames)}\n  ${call.location}`);
}

if (mismatched.length) {
  if (missing.length) console.error('');
  console.error('RPC calls whose named argument contract matches no local CREATE FUNCTION:');
  for (const { call, definitions } of mismatched) {
    console.error(`- ${call.name} call ${formatArguments(call.argNames)} (${call.argNames.length} args)`);
    console.error(`  caller: ${call.location}`);
    for (const definition of definitions) {
      console.error(`  defined: ${formatArguments(definition.argNames)} (${definition.argNames.length} args) at ${definition.location}`);
    }
  }
}

if (dynamic.length) {
  if (missing.length || mismatched.length) console.error('');
  console.error('RPC calls whose argument contract cannot be verified statically:');
  for (const call of dynamic) console.error(`- ${call.name}: ${call.dynamicReason}\n  ${call.location}`);
}

if (missing.length || mismatched.length || dynamic.length) {
  const missingNames = new Set(missing.map((call) => call.name));
  const mismatchedNames = new Set(mismatched.map(({ call }) => call.name));
  console.error('');
  console.error(
    `RPC contract FAILED: ${missingNames.size} missing RPC names (${missing.length} call sites), `
    + `${mismatchedNames.size} RPC names with argument mismatches (${mismatched.length} call sites), `
    + `${dynamic.length} unverifiable call sites.`,
  );
  process.exitCode = 1;
} else {
  const referencedNames = new Set(calls.map((call) => call.name));
  console.log(`RPC contract OK: ${calls.length} call sites across ${referencedNames.size} RPC names match local function argument names and counts.`);
}
