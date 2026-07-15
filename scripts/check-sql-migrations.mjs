import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const migrationRoot = path.join(root, 'supabase', 'migrations');
const names = (await readdir(migrationRoot)).filter((name) => name.endsWith('.sql')).sort();
const errors = [];

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

const prefixes = new Map();
for (const name of names) {
  const prefix = name.match(/^(\d+)/)?.[1];
  if (prefix) {
    const previous = prefixes.get(prefix);
    if (previous) errors.push(`${name}: migration version duplicates ${previous}`);
    else prefixes.set(prefix, name);
  }

  const file = path.join(migrationRoot, name);
  const sql = await readFile(file, 'utf8');

  for (const match of sql.matchAll(/\bEND\s*\r?\n(\$[A-Za-z_][A-Za-z0-9_]*\$;|\$\$;)/g)) {
    errors.push(`${name}:${lineNumber(sql, match.index)} PL/pgSQL body must end with END;`);
  }

  const delimiterCounts = new Map();
  for (const match of sql.matchAll(/\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/g)) {
    delimiterCounts.set(match[0], (delimiterCounts.get(match[0]) ?? 0) + 1);
  }
  for (const [delimiter, count] of delimiterCounts) {
    if (count % 2 !== 0) errors.push(`${name}: unmatched dollar delimiter ${delimiter} (${count} occurrences)`);
  }

  if (name.startsWith('20260713')) {
    const functionStarts = [...sql.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\b/gi)];
    for (let index = 0; index < functionStarts.length; index += 1) {
      const start = functionStarts[index].index;
      const stop = functionStarts[index + 1]?.index ?? sql.length;
      const block = sql.slice(start, stop);
      const bodyStart = block.match(/\bAS\s+(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/i)?.index;
      if (bodyStart === undefined) continue;
      const header = block.slice(0, bodyStart);
      if (/\bSECURITY\s+DEFINER\b/i.test(header) && !/\bSET\s+search_path\s*=/i.test(header)) {
        errors.push(`${name}:${lineNumber(sql, start)} SECURITY DEFINER function has no fixed search_path`);
      }
    }

    const broadAllGrant = /GRANT\s+ALL(?:\s+PRIVILEGES)?\s+ON\s+[^;]+?\s+TO\s+(?:PUBLIC|anon|authenticated)\s*;/i;
    const broadFunctionGrant = /GRANT\s+EXECUTE\s+ON\s+ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+[^;]+?\s+TO\s+(?:PUBLIC|anon|authenticated)\s*;/i;
    if (broadAllGrant.test(sql) || broadFunctionGrant.test(sql)) {
      errors.push(`${name}: broad table/function grant to a Data API role is forbidden`);
    }

    // The privacy hardening migration removes merchant_profiles.user_id from
    // Data API column grants and revokes the generic user-block helper.  Any
    // later RLS/storage policy must therefore use the dedicated SECURITY
    // DEFINER identity helpers; a cross-table mp.user_id read or direct call to
    // is_user_blocked(uuid) would make the policy fail for real API users.
    if ((prefix ?? '').localeCompare('20260713164525') >= 0) {
      for (const policy of sql.matchAll(/CREATE\s+POLICY\b[\s\S]*?;/gi)) {
        if (/\bmp\.user_id\b/i.test(policy[0])) {
          errors.push(`${name}:${lineNumber(sql, policy.index)} policy reads restricted merchant identity; use an ownership helper`);
        }
        if (/\bpublic\.is_user_blocked\s*\(/i.test(policy[0])) {
          errors.push(`${name}:${lineNumber(sql, policy.index)} policy calls revoked is_user_blocked(uuid); use a callable current-user helper`);
        }
      }
    }
  }
}

if (errors.length) {
  console.error(`SQL migration static checks failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`SQL migration static checks passed (${names.length} migrations).`);
