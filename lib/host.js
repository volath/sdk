'use strict';
/**
 * Runs inside the plugin's own Node process (started by runtime.js), never inside Volath. Loads the plugin's `main` file,
 * hands it a `ctx` and answers the calls of Volath. Everything the plugin may do besides plain computation (network,
 * tickets, storage) goes through `ctx`, where Volath checks the permissions the plugin was granted.
 *
 * Protocol (process.send / process.on('message')):
 *   Volath -> host   { t: 'call', id, method: 'onLoad' | 'onEvent' | 'onRequest' | 'onWebhook' | 'onPrompt' | 'task', args, ctx }
 *   host -> Volath   { t: 'result', id, ok, value | error }      { t: 'rpc', id, method, args }      { t: 'log', level, message }
 *   Volath -> host   { t: 'rpc-result', id, ok, value | error }
 *   host -> Volath   { t: 'stats', rss, cpu, uptime }   every few seconds: memory (bytes), cpu time used (microseconds) and seconds since the process started
 */
const path = require('path');
const { CALLS } = require('./manifest');

const [, , dir, main] = process.argv;
const pending = new Map();
let nextRpc = 1;
let plugin = {};

const send = (msg) => process.send && process.send(msg);
const text = (args) => args.map((a) => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ');

function rpc(method, args) {
  return new Promise((resolve, reject) => {
    const id = nextRpc++;
    pending.set(id, { resolve, reject });
    send({ t: 'rpc', id, method, args });
  });
}

/** ctx.tickets, ctx.projects, ctx.developers... : one function per entry of CALLS (the permissions are checked by Volath). */
function volathApi() {
  const api = {};
  for (const method of Object.keys(CALLS)) {
    const [space, fn] = method.split('.');
    (api[space] = api[space] || {})[fn] = (...args) => rpc(method, args);
  }
  return api;
}

function makeCtx(base) {
  const log = (level) => (...args) => send({ t: 'log', level, message: text(args) });
  return {
    plugin: base.plugin,
    settings: base.settings || {},
    projectId: base.projectId || null,
    log: Object.assign(log('info'), { info: log('info'), warn: log('warn'), error: log('error') }),
    http: { fetch: (url, init) => rpc('http.fetch', [String(url), init || {}]) },
    ...volathApi(),
    storage: {
      get: (key) => rpc('storage.get', [key]),
      set: (key, value) => rpc('storage.set', [key, value]),
      delete: (key) => rpc('storage.delete', [key]),
    },
  };
}

async function handle(msg) {
  const ctx = makeCtx(msg.ctx || {});
  const [a, b] = msg.args || [];
  switch (msg.method) {
    case 'onLoad': return plugin.onLoad ? plugin.onLoad(ctx) : undefined;
    case 'onEvent': return plugin.onEvent ? plugin.onEvent(a, ctx) : undefined;
    case 'onRequest': {
      if (!plugin.onRequest) return { status: 404, json: { error: 'This plugin has no onRequest handler' } };
      return plugin.onRequest(a, ctx);
    }
    case 'onWebhook': {
      if (!plugin.onWebhook) return { status: 404, json: { error: 'This plugin has no onWebhook handler' } };
      return plugin.onWebhook(a, ctx);
    }
    case 'onPrompt': return plugin.onPrompt ? plugin.onPrompt(a, ctx) : undefined;
    case 'task': {
      const fn = plugin.tasks && plugin.tasks[a];
      if (typeof fn !== 'function') throw new Error(`The plugin has no task "${a}" in module.exports.tasks`);
      return fn(ctx, b);
    }
    default: throw new Error(`Unknown call ${msg.method}`);
  }
}

process.on('message', async (msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'rpc-result') {
    const waiting = pending.get(msg.id);
    if (!waiting) return;
    pending.delete(msg.id);
    if (msg.ok) waiting.resolve(msg.value);
    else waiting.reject(new Error(msg.error || 'Volath refused the call'));
    return;
  }
  if (msg.t === 'call') {
    try {
      const value = await handle(msg);
      send({ t: 'result', id: msg.id, ok: true, value: value === undefined ? null : value });
    } catch (err) {
      send({ t: 'result', id: msg.id, ok: false, error: String((err && err.stack) || err).slice(0, 4000) });
    }
  }
});

process.on('unhandledRejection', (err) => send({ t: 'log', level: 'error', message: `Unhandled rejection: ${(err && err.message) || err}` }));
process.on('uncaughtException', (err) => {
  send({ t: 'log', level: 'error', message: `Uncaught exception: ${(err && err.stack) || err}` });
  process.exit(1);
});

// Health numbers for Volath (memory and cpu of this process): a heartbeat that never keeps the process alive
const STATS_EVERY_MS = 3000;
function sendStats() {
  const cpu = process.cpuUsage();
  send({ t: 'stats', rss: process.memoryUsage().rss, cpu: cpu.user + cpu.system, uptime: process.uptime() });
}
setInterval(sendStats, STATS_EVERY_MS).unref();

try {
  plugin = require(path.resolve(dir, main)) || {};
  send({ t: 'ready' });
  sendStats();
} catch (err) {
  send({ t: 'fatal', error: String((err && err.stack) || err).slice(0, 4000) });
  process.exit(1);
}
