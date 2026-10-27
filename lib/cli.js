#!/usr/bin/env node
'use strict';
/**
 * The plugin tool. Needs only Node 20+ and this folder (no install):
 *
 *   node cli.js new <id> [--template <example>]   a new plugin folder with plugin.json, code, README and AGENTS.md (examples: see the examples folder)
 *   node cli.js validate <folder|zip>             checks plugin.json and the files it points to
 *   node cli.js pack <folder> [out.zip]           validates and writes the zip to drop into Volath
 *   node cli.js test <folder|zip> [options]       starts the plugin like Volath does and sends it sample events
 *       --event <type>      only this event (default: every event the plugin subscribes to)
 *       --data '<json>'     replaces the "data" of the sample event
 *       --settings '<json>' values of the plugin settings (defaults are used for the rest)
 *       --live              really call the network (default: requests are only printed)
 */
const fs = require('fs');
const path = require('path');
const { validateManifest, everyMs, API_VERSION } = require('./manifest');
const { readZip, writeZip } = require('./zip');
const { createBroker } = require('./broker');
const { PluginProcess, sandboxFlag } = require('./runtime');
const { CALLS } = require('./manifest');

const SAMPLE_DATA = {
  'ticket.status_changed': { from: 'In Development', to: 'Code Review' },
  'pr.opened': { number: 42, title: 'Add the thing', url: 'https://github.com/acme/shop/pull/42' },
  'test.finished': { result: 'passed', environment: 'staging', stepsPassed: 8, stepsTotal: 8 },
  'ci.failed': { checks: ['build'], url: 'https://github.com/acme/shop/pull/42' },
  'deploy.finished': { environment: 'staging' },
  'budget.exceeded': { scope: 'ticket', limitUsd: 5, spentUsd: 5.2 },
  'approval.requested': { step: 'pullRequest' },
  digest: { merged: 3, stuck: 1 },
  'ticket.updated': { status: 'In Development' },
  'ticket.deleted': {},
  'ticket.timeline': { title: 'Development done' },
  'ticket.activity': { message: 'Running the analysis' },
  'ai.job': { state: 'finished' },
  notification: { title: 'Hello', message: 'A notification' },
  'ticket.created': { id: 'sample-ticket', number: 1001, title: 'Sample ticket', description: 'What to do', type: 'Feature', status: 'To Do' },
  'ticket.comment_added': { id: 'c1', author: 'Alex', content: 'A comment' },
  'project.created': { id: 'sample-project', name: 'Sample project', description: '', active: true, customFields: {} },
  'project.updated': { id: 'sample-project', name: 'Sample project', description: '', active: true, customFields: {} },
  'project.deleted': { id: 'sample-project', name: 'Sample project' },
  'developer.created': { id: 'sample-developer', projectId: 'sample-project', userId: 'sample-user', name: 'Alex', email: 'alex@example.com', role: 'Backend' },
  'developer.updated': { id: 'sample-developer', projectId: 'sample-project', userId: 'sample-user', name: 'Alex', email: 'alex@example.com', role: 'Backend' },
  'customfield.created': { id: 'sample-field', code: 'cost_center', name: 'Cost center', entityType: 'ticket', fieldType: 'text', options: null },
  'customfield.updated': { id: 'sample-field', code: 'cost_center', name: 'Cost center', entityType: 'ticket', fieldType: 'text', options: null },
  'customfield.deleted': { id: 'sample-field', code: 'cost_center', name: 'Cost center', entityType: 'ticket', fieldType: 'text', options: null },
  'workflow.updated': { projectId: 'sample-project', name: 'Project workflow', steps: ['To Do', 'In Development', 'Done'], reset: false },
};

/** A made-up answer for each entry of CALLS, so a plugin can be tried without a Volath: the call is printed and returns a sample. */
function sampleApi() {
  const counters = {};
  const show = (name, args) => console.log(`    ${name}(${args.map((a) => JSON.stringify(a)).join(', ').slice(0, 200)})`);
  const api = {};
  for (const method of Object.keys(CALLS)) {
    const [space, fn] = method.split('.');
    (api[space] = api[space] || {})[fn] = async (...args) => {
      show(method, args);
      counters[space] = (counters[space] || 0) + 1;
      const n = counters[space];
      const first = args[0] && typeof args[0] === 'object' ? args[0] : {};
      if (/\.(list|comments)$/.test(method)) return [];
      if (method === 'tickets.get') return { id: args[0], ticketNumber: 1001, title: 'Sample ticket', status: 'To Do', customFields: {} };
      if (method === 'projects.get') return { id: args[0], name: 'Sample project', customFields: {} };
      if (method === 'users.get') return { id: args[0], name: 'Sample user', role: 'Viewer', active: true };
      return { id: `sample-${space}-${n}`, ...first };
    };
  }
  return api;
}

const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => console.log(`  ✗ ${m}`);
const note = (m) => console.log(`  ! ${m}`);

/** Files of a folder or zip as { name -> Buffer }. */
function load(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return new Map(readZip(fs.readFileSync(target)).map((f) => [f.name, f.data]));
  const files = new Map();
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' && prefix === '') note('node_modules is not inside the zip when you pack: bundle dependencies into one file or commit them if the plugin needs them.');
      if (entry.name.startsWith('.') || (entry.name === 'node_modules' && prefix === '')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, `${prefix}${entry.name}/`);
      else files.set(`${prefix}${entry.name}`, fs.readFileSync(full));
    }
  };
  walk(target, '');
  return files;
}

function check(files) {
  const raw = files.get('plugin.json');
  if (!raw) return { ok: false, manifest: null, errors: ['plugin.json is missing at the top of the zip (not inside a subfolder)'], warnings: [] };
  let parsed;
  try { parsed = JSON.parse(raw.toString('utf-8')); } catch (e) { return { ok: false, manifest: null, errors: [`plugin.json is not valid JSON: ${e.message}`], warnings: [] }; }
  const result = validateManifest(parsed);
  if (!result.ok) return result;
  const m = result.manifest;
  if (m.main && !files.has(m.main)) result.errors.push(`main: "${m.main}" is not in the zip`);
  if (m.logo && !files.has(m.logo)) result.errors.push(`logo: "${m.logo}" is not in the zip`);
  else if (m.logo && files.get(m.logo).length > 512 * 1024) result.errors.push(`logo: "${m.logo}" is larger than 512 KB`);
  for (const entry of m.ui ? [m.ui.entry, ...(m.ui.slots || []).map((x) => x.entry)] : []) {
    if (entry && !files.has(entry)) result.errors.push(`ui: "${entry}" is not in the zip`);
  }
  if (m.main && files.has(m.main)) {
    const code = files.get(m.main).toString('utf-8');
    if (/child_process|require\(['"]worker_threads['"]\)/.test(code)) result.warnings.push('main: uses child_process or worker_threads, which the sandbox blocks');
    if (/process\.env/.test(code)) result.warnings.push('main: process.env holds no Volath values; read configuration from ctx.settings');
  }
  result.ok = result.errors.length === 0;
  return result;
}

function report(result, files) {
  console.log(result.manifest ? `${result.manifest.name} ${result.manifest.version} (${result.manifest.id})` : 'plugin.json');
  if (files) ok(`${files.size} file${files.size === 1 ? '' : 's'}`);
  result.errors.forEach(bad);
  result.warnings.forEach(note);
  if (result.ok) ok('The manifest is valid.');
}

async function test(target, args) {
  const files = load(target);
  const result = check(files);
  report(result, files);
  if (!result.ok) return 1;
  const m = result.manifest;
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const live = args.includes('--live');
  const given = opt('--settings') ? JSON.parse(opt('--settings')) : {};
  const settings = {};
  for (const f of m.settings || []) settings[f.key] = given[f.key] ?? f.fallback ?? (f.type === 'toggle' ? false : '');
  for (const f of m.settings || []) if (f.required && (settings[f.key] === '' || settings[f.key] === undefined)) note(`settings.${f.key} is required: pass it with --settings '{"${f.key}": "..."}'`);

  const sent = [];
  const stored = new Map();
  const broker = createBroker({
    manifest: m,
    settings,
    dryRun: live ? undefined : (req) => { sent.push(req); console.log(`    -> ${req.method} ${req.url}${req.body ? `  ${String(req.body).slice(0, 200)}` : ''}`); },
    api: sampleApi(),
    storage: { get: async (k) => stored.get(k) ?? null, set: async (k, v) => { stored.set(k, v); }, delete: async (k) => { stored.delete(k); } },
  });

  const subscribed = (m.permissions && m.permissions.events) || [];
  const events = opt('--event') ? [opt('--event')] : subscribed.includes('*') ? Object.keys(SAMPLE_DATA) : subscribed;
  const envelope = (type) => ({
    event: type, type, deliveryId: 'sample', timestamp: new Date().toISOString(),
    project: { id: 'sample-project', name: 'Sample project', customFields: {} },
    ticket: { id: 'sample-ticket', number: 1001, title: 'Sample ticket', customFields: {} },
    data: opt('--data') ? JSON.parse(opt('--data')) : SAMPLE_DATA[type] || {},
  });

  let failures = 0;
  if ((m.actions || []).length) {
    console.log('\nActions');
    for (const type of events) {
      const sample = envelope(type);
      // Make the sample event match the "when" of the actions that listen to it, so they are exercised
      for (const a of (m.actions || []).filter((x) => x.on === type)) {
        for (const [p, v] of Object.entries(a.when || {})) {
          if (p.startsWith('settings.')) continue;
          const keys = p.replace(/^event\./, '').split('.');
          let o = sample;
          keys.slice(0, -1).forEach((k) => { o = o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {}; });
          o[keys[keys.length - 1]] = v;
        }
      }
      const out = await broker.runActions(sample);
      out.forEach((r) => (r.ok ? ok(`${type} -> ${r.url} (${r.status})`) : (failures++, bad(`${type} -> ${r.url}: ${r.error || r.status}`))));
    }
  }

  if (m.main) {
    console.log('\nCode');
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'volath-plugin-test-'));
    for (const [name, data] of files) { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), data); }
    const ctxBase = { plugin: { id: m.id, version: m.version }, settings, projectId: 'sample-project' };
    const proc = new PluginProcess({
      dir, main: m.main, rpc: (method, a) => broker.rpc(method, a),
      onLog: (level, message) => console.log(`    [${level}] ${message}`),
    });
    const step = async (label, fn) => {
      const t = Date.now();
      try { const v = await fn(); ok(`${label} (${Date.now() - t} ms)${v === undefined ? '' : ` -> ${JSON.stringify(v).slice(0, 160)}`}`); } catch (e) { failures++; bad(`${label}: ${String(e.message).split('\n')[0]}`); }
    };
    try {
      await proc.start();
      ok(proc.sandboxed ? `Started in the sandbox (${sandboxFlag()}).` : 'Started WITHOUT a sandbox (this Node has no permission model): upgrade Node to test it the way Volath runs it.');
      await step('onLoad', () => proc.call('onLoad', [], ctxBase));
      for (const type of events) await step(`onEvent ${type}`, () => proc.call('onEvent', [envelope(type)], ctxBase));
      for (const s of m.schedule || []) await step(`task ${s.task} (every ${s.every})`, () => proc.call('task', [s.task], ctxBase));
      if (m.ui) await step('onRequest GET /api/ping', () => proc.call('onRequest', [{ method: 'GET', path: '/ping', query: {}, headers: {}, body: null, user: { name: 'Tester', permissions: ['*'] } }], ctxBase));
    } catch (e) {
      failures++;
      bad(`The plugin could not start: ${String(e.message).split('\n').slice(0, 6).join('\n      ')}`);
    } finally {
      await proc.stop();
      try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* temp folder, the system cleans it */ }
    }
  }
  console.log(failures ? `\n${failures} problem${failures === 1 ? '' : 's'} found.` : '\nAll good.');
  return failures ? 1 : 0;
}

/** Where the example plugins are: next to this file in Volath, one level up in the SDK package */
const examplesDir = () => [path.join(__dirname, 'examples'), path.join(__dirname, '..', 'examples')].find((d) => fs.existsSync(d));
const guidePath = () => [path.join(__dirname, '..', 'docs', 'AI_GUIDE.md'), path.join(__dirname, 'PLUGIN_AI_GUIDE.md')].find((p) => fs.existsSync(p));

const BLANK_CODE = `/** @type {import('@volath/sdk').PluginModule} */
module.exports = {
  async onEvent(event, ctx) {
    ctx.log('got', event.type, event.ticket && event.ticket.title);
  },
};
`;

function scaffold(id, rest) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) { bad('The id is lowercase letters, digits and dashes, for example "my-plugin".'); return 1; }
  const dir = path.resolve(id);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) { bad(`${dir} already exists and is not empty.`); return 1; }
  const ti = rest.indexOf('--template');
  const template = ti >= 0 ? rest[ti + 1] : 'blank';
  fs.mkdirSync(dir, { recursive: true });
  const title = id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  if (template === 'blank') {
    const manifest = { id, name: title, version: '0.1.0', apiVersion: API_VERSION, description: 'What this plugin does, in one sentence', main: 'index.js', permissions: { events: ['ticket.created'], tickets: 'read' } };
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(dir, 'index.js'), BLANK_CODE);
  } else {
    const from = examplesDir() && path.join(examplesDir(), template);
    if (!from || !fs.existsSync(path.join(from, 'plugin.json'))) {
      const known = examplesDir() ? fs.readdirSync(examplesDir()).filter((d) => fs.existsSync(path.join(examplesDir(), d, 'plugin.json'))) : [];
      bad(`There is no template "${template}". Use blank${known.length ? ', ' + known.join(', ') : ''}.`);
      return 1;
    }
    fs.cpSync(from, dir, { recursive: true });
    const file = path.join(dir, 'plugin.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...manifest, id, name: title, version: '0.1.0' }, null, 2) + '\n');
  }
  const guide = guidePath();
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${title}\n\nWhat it does, and why it asks for each permission.\n\n\`\`\`\nvolath-plugin validate .\nvolath-plugin test .\nvolath-plugin pack .   # then drop the zip on Settings > Plugins in Volath\n\`\`\`\n`);
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), `# Instructions for AI assistants\n\nThis folder is a plugin for Volath. Before changing it, read the plugin guide: ${guide ? path.relative(dir, guide).replace(/\\\\/g, '/') + ' (or ' : ''}https://github.com/volath/sdk/blob/main/docs/AI_GUIDE.md${guide ? ')' : ''}.\n\n- Use only the permissions, events and ctx functions listed there; ask for the least access that works.\n- After every change run: volath-plugin validate . && volath-plugin test .\n- Keep one source file per purpose and no build step: the zip holds exactly what runs.\n`);
  ok(`Created ${dir} (${template}). Next: cd ${id} && volath-plugin test .`);
  return 0;
}

async function main() {
  const [cmd, target, ...rest] = process.argv.slice(2);
  if (cmd === 'new' && target) return scaffold(target, rest);
  if (!cmd || !target || !['validate', 'pack', 'test'].includes(cmd)) {
    console.log(fs.readFileSync(__filename, 'utf-8').split('*/')[0].split('\n').slice(2).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
    return 2;
  }
  if (cmd === 'test') return test(target, rest);
  const files = load(target);
  const result = check(files);
  report(result, files);
  if (!result.ok) return 1;
  if (cmd === 'pack') {
    const out = path.resolve(rest[0] || `${result.manifest.id}-${result.manifest.version}.zip`);
    fs.writeFileSync(out, writeZip([...files].map(([name, data]) => ({ name, data }))));
    ok(`Written ${out} (${fs.statSync(out).size} bytes). Drop it on Settings > Plugins in Volath.`);
  }
  return 0;
}

if (require.main === module) main().then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(1); });
module.exports = { check, load, main };
