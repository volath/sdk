#!/usr/bin/env node
'use strict';
/**
 * Copies the plugin tool from the Volath app into lib/ so the SDK runs exactly the code that checks plugins inside Volath.
 * The app (backend/assets/plugin-sdk) is the source of truth: change it there, then run `npm run sync` here and commit the result.
 *
 *   node scripts/sync.js [path to backend/assets/plugin-sdk]
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2] || process.env.VOLATH_PLUGIN_SDK || path.join(root, '..', 'homodeus4', 'backend', 'assets', 'plugin-sdk'));
if (!fs.existsSync(path.join(source, 'manifest.js'))) {
  console.error(`The plugin tool of Volath was not found in ${source}. Pass its path: node scripts/sync.js <backend/assets/plugin-sdk>`);
  process.exit(1);
}

const lib = path.join(root, 'lib');
fs.rmSync(lib, { recursive: true, force: true });
fs.mkdirSync(lib, { recursive: true });
let copied = 0;
for (const file of fs.readdirSync(source)) {
  const from = path.join(source, file);
  if (!fs.statSync(from).isFile() || !/\.(js|md)$/.test(file) || /\.test\.js$/.test(file) || file === 'PLUGIN_AI_GUIDE.md') continue;
  fs.copyFileSync(from, path.join(lib, file));
  copied++;
}

// The examples are part of the SDK: they are the templates of `volath-plugin new` and the best documentation there is
const examples = path.join(root, 'examples');
fs.rmSync(examples, { recursive: true, force: true });
fs.cpSync(path.join(source, 'examples'), examples, { recursive: true });

console.log(`Copied ${copied} files to lib/ and the examples from ${source}`);
