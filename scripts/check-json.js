const fs = require('node:fs');
const path = require('node:path');

const ignoredDirectories = new Set(['.git', 'node_modules', 'coverage']);
const jsonFiles = [];

walk(process.cwd());

for (const file of jsonFiles) {
  JSON.parse(fs.readFileSync(file, 'utf8'));
}

console.log(`Parsed ${jsonFiles.length} JSON files.`);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        walk(path.join(dir, entry.name));
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      jsonFiles.push(path.join(dir, entry.name));
    }
  }
}
