const fs = require('node:fs');
const path = require('node:path');

const MAX_SOURCE_LINES = 500;
const sourceExtensions = new Set(['.js', '.sh']);
const ignoredDirectories = new Set(['.git', 'node_modules', 'coverage']);
const files = [];

walk(process.cwd());

const oversized = files
  .map((file) => ({ file, lines: countSourceLines(file) }))
  .filter((entry) => entry.lines > MAX_SOURCE_LINES);

if (oversized.length > 0) {
  for (const entry of oversized) {
    console.error(`${path.relative(process.cwd(), entry.file)} has ${entry.lines} source lines.`);
  }
  console.error(`Source files must stay at or below ${MAX_SOURCE_LINES} source lines.`);
  process.exit(1);
}

console.log(`Checked ${files.length} source files for <= ${MAX_SOURCE_LINES} source lines.`);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        walk(fullPath);
      }
      continue;
    }
    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
}

function countSourceLines(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('#');
    }).length;
}
