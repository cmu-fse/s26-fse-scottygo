#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

const SOURCE_DIRS = ['client', 'server', 'common', 'tools'];
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.tsx',
  '.jsx',
  '.json',
  '.md',
  '.css',
  '.html',
  '.pug',
  '.yaml',
  '.yml',
  '.sh'
]);
const CODE_EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx']);
const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  '.dist',
  'dist',
  'build',
  '.coverage',
  'coverage'
]);

function runCommand(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: ROOT,
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function walkFiles(startDir, extensions) {
  const files = [];
  const stack = [startDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') {
        if (entry.name !== '.github') {
          continue;
        }
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function findConflictMarkers(files) {
  const markers = [];
  const markerRegex = /^(<<<<<<<|=======|>>>>>>>)/;

  for (const filePath of files) {
    const relPath = path.relative(ROOT, filePath);
    const contents = fs.readFileSync(filePath, 'utf8');
    const lines = contents.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      if (markerRegex.test(lines[i])) {
        markers.push({ file: relPath, line: i + 1, text: lines[i] });
      }
    }
  }

  return markers;
}

function stripLineComments(line) {
  const commentIndex = line.indexOf('//');
  if (commentIndex >= 0) return line.slice(0, commentIndex);
  return line;
}

function countChar(line, char) {
  let total = 0;
  for (const c of line) {
    if (c === char) total += 1;
  }
  return total;
}

function hasBodyStart(lines, startIndex, matchLine, matchEndIndex) {
  const afterMatch = matchLine.slice(matchEndIndex);
  if (afterMatch.includes('{')) return true;
  if (afterMatch.includes(';')) return false;

  for (
    let i = startIndex + 1;
    i < Math.min(lines.length, startIndex + 5);
    i += 1
  ) {
    const candidate = stripLineComments(lines[i]).trim();
    if (!candidate) continue;
    if (candidate.startsWith('{')) return true;
    if (candidate.startsWith(';')) return false;
    if (candidate.includes('{')) return true;
    if (candidate.includes(';')) return false;
  }

  return false;
}

function scanDuplicateDefinitions(files) {
  const duplicateEntries = [];

  for (const filePath of files) {
    const relPath = path.relative(ROOT, filePath);
    const contents = fs.readFileSync(filePath, 'utf8');
    const lines = contents.split(/\r?\n/);

    let braceDepth = 0;
    const classStack = [];
    const classMethodLines = new Map();
    const topFunctionLines = new Map();

    for (let i = 0; i < lines.length; i += 1) {
      const rawLine = lines[i];
      const line = stripLineComments(rawLine);
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      const classMatch = trimmed.match(
        /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/
      );

      if (classMatch) {
        classStack.push({
          name: classMatch[1],
          startDepth: braceDepth + countChar(line, '{') - countChar(line, '}')
        });
      }

      const currentClass = classStack[classStack.length - 1] ?? null;

      if (currentClass && braceDepth === currentClass.startDepth) {
        const methodMatch = trimmed.match(
          /^(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/
        );

        if (methodMatch) {
          const methodName = methodMatch[1];
          const isReserved = new Set([
            'if',
            'for',
            'while',
            'switch',
            'catch',
            'constructor'
          ]).has(methodName);

          if (
            !isReserved &&
            hasBodyStart(lines, i, line, methodMatch[0].length)
          ) {
            const key = `${currentClass.name}.${methodName}`;
            if (!classMethodLines.has(key)) classMethodLines.set(key, []);
            classMethodLines.get(key).push(i + 1);
          }
        }
      } else {
        const fnMatch = trimmed.match(
          /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/
        );

        if (fnMatch && hasBodyStart(lines, i, line, fnMatch[0].length)) {
          const fnName = fnMatch[1];
          if (!topFunctionLines.has(fnName)) topFunctionLines.set(fnName, []);
          topFunctionLines.get(fnName).push(i + 1);
        }
      }

      braceDepth += countChar(line, '{') - countChar(line, '}');

      while (classStack.length > 0) {
        const active = classStack[classStack.length - 1];
        if (braceDepth < active.startDepth) {
          classStack.pop();
        } else {
          break;
        }
      }
    }

    for (const [name, linesFound] of classMethodLines.entries()) {
      if (linesFound.length > 1) {
        duplicateEntries.push({
          file: relPath,
          kind: 'class-method',
          name,
          lines: linesFound
        });
      }
    }

    for (const [name, linesFound] of topFunctionLines.entries()) {
      if (linesFound.length > 1) {
        duplicateEntries.push({
          file: relPath,
          kind: 'top-function',
          name,
          lines: linesFound
        });
      }
    }
  }

  return duplicateEntries;
}

function failWithDetails(title, details) {
  console.error(`\n✗ ${title}`);
  for (const line of details) {
    console.error(line);
  }
  process.exit(1);
}

function main() {
  console.log('Running pre-push safety checklist...');

  const sourceFiles = [];
  const textFiles = [];

  for (const dir of SOURCE_DIRS) {
    const fullDir = path.join(ROOT, dir);
    if (!fs.existsSync(fullDir)) continue;
    sourceFiles.push(...walkFiles(fullDir, CODE_EXTENSIONS));
    textFiles.push(...walkFiles(fullDir, TEXT_EXTENSIONS));
  }

  console.log('\n1/5 Checking for unresolved merge conflict markers...');
  const conflictMarkers = findConflictMarkers(textFiles);
  if (conflictMarkers.length > 0) {
    const details = conflictMarkers
      .slice(0, 40)
      .map((m) => `- ${m.file}:${m.line} ${m.text}`);
    if (conflictMarkers.length > 40) {
      details.push(`- ...and ${conflictMarkers.length - 40} more`);
    }
    failWithDetails('Found unresolved conflict markers.', details);
  }
  console.log('✓ No conflict markers found.');

  console.log(
    '\n2/5 Checking for duplicate method/function definitions in source...'
  );
  const duplicates = scanDuplicateDefinitions(sourceFiles);
  if (duplicates.length > 0) {
    const details = duplicates.map(
      (d) =>
        `- ${d.file} :: ${d.name} (${d.kind}) at lines ${d.lines.join(', ')}`
    );
    failWithDetails('Found duplicate definitions.', details);
  }
  console.log('✓ No duplicate source definitions found.');

  console.log('\n3/5 Running Prettier...');
  runCommand('npx', ['prettier', '--write', '.']);

  console.log('\n4/5 Running lint...');
  runCommand('npm', ['run', 'lint']);

  console.log('\n5/5 Running tests...');
  runCommand('npm', ['test']);

  console.log('\n✓ Pre-push safety checklist passed.');
}

main();
