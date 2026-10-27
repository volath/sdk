'use strict';
/**
 * What a plugin may ask Volath to do (ctx.http, ctx.tickets, ctx.storage) and the declarative `actions` of a manifest.
 * Every call is checked here against the permissions of the manifest, outside the plugin's process.
 */
const { allowsHost, CALLS, grants, ITEM_PERMISSIONS } = require('./manifest');

// No cap on a response or a stored value: a plugin may move as much data as it needs. A call is cut off after a minute (runtime.js)
const FETCH_TIMEOUT_MS = 55000;

/** `a.b.c` in a nested object. */
function lookup(obj, dotted) {
  return String(dotted).split('.').reduce((v, k) => (v !== null && typeof v === 'object' ? v[k] : undefined), obj);
}

/** Replaces {{event.ticket.title}} / {{settings.baseUrl}}. A value that is a single placeholder keeps its type. */
function render(value, scope) {
  if (typeof value === 'string') {
    const whole = /^\{\{\s*([\w.]+)\s*\}\}$/.exec(value);
    if (whole) return lookup(scope, whole[1]) ?? '';
    return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
      const v = lookup(scope, path);
      return v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => render(v, scope));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, render(v, scope)]));
  return value;
}

/**
 * @param {{ manifest: any, settings: Record<string, any>, api?: Record<string, Record<string, Function>>, tickets?: any, storage?: any, dryRun?: (request: object) => void }} deps
 *   dryRun: when set, requests are checked and handed to it instead of being sent (plugin test)
 *   api: what the CALLS of manifest.js do, by namespace: { tickets: { list, get, ... }, projects: { ... }, developers: { ... }, ... }
 *   tickets: the same as api.tickets, kept for callers written before api existed  storage: { get(key), set(key, value), delete(key) }
 */
function createBroker({ manifest, settings, api, tickets, storage, dryRun }) {
  const handlers = { ...(api || {}), ...(tickets && !(api && api.tickets) ? { tickets } : {}) };
  const perms = manifest.permissions || {};

  async function fetchAllowed(url, init) {
    let target;
    try { target = new URL(url); } catch { throw new Error(`"${url}" is not a valid URL.`); }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error('Only http and https addresses can be called.');
    if (!allowsHost(perms.network, target.host) && !allowsHost(perms.network, target.hostname)) {
      throw new Error(`The plugin may not call ${target.host}. Add it to permissions.network in plugin.json.`);
    }
    const method = String(init.method || 'GET').toUpperCase();
    const headers = { 'User-Agent': `Volath-Plugin/${manifest.id}`, ...(init.headers || {}) };
    let body = init.body;
    if (body !== undefined && body !== null && typeof body !== 'string') {
      body = JSON.stringify(body);
      if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
    }
    if (dryRun) {
      dryRun({ method, url: target.href, headers, body });
      return { status: 200, ok: true, headers: {}, body: '{}', json: {} };
    }
    // Redirects are not followed: the target of a redirect was never approved
    const res = await fetch(target, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : body, redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const buf = Buffer.from(await res.arrayBuffer());
    const textBody = buf.toString('utf-8');
    let json = null;
    try { json = JSON.parse(textBody); } catch { /* not JSON */ }
    return { status: res.status, ok: res.ok, headers: Object.fromEntries(res.headers.entries()), body: textBody, json };
  }

  /** A call of CALLS (tickets.create, developers.add...): checked against the permissions, then handed to Volath. */
  async function volathCall(method, args) {
    const need = CALLS[method];
    const [space, fn] = method.split('.');
    if (!grants(perms, method)) {
      const [name, level] = need;
      if (ITEM_PERMISSIONS[name]) throw new Error(`The plugin may not use ${method}. Add "${level}" to the "${name}" list in permissions (or "${name}": true).`);
      if (level === true) throw new Error(`The plugin may not use ${method}. Add "${name}": true to permissions in plugin.json.`);
      if (perms[name] === 'read') throw new Error(`The plugin may only read ${name}. Set "${name}": "${level}" in permissions to use ${method}.`);
      if (perms[name]) throw new Error(`The plugin has "${perms[name]}" access to ${name}, and ${method} needs "${level}". Change "${name}" in permissions.`);
      throw new Error(`The plugin may not use ${method}. Add "${name}": "${level}" to permissions in plugin.json.`);
    }
    const target = handlers[space] && handlers[space][fn];
    if (typeof target !== 'function') throw new Error(`${method} is not available here.`);
    return target(...args);
  }
  function needStorage() {
    if (!perms.storage || !storage) throw new Error('The plugin may not store data. Add "storage": true to permissions in plugin.json.');
  }

  async function rpc(method, args) {
    switch (method) {
      case 'http.fetch': return fetchAllowed(args[0], args[1] || {});
      case 'storage.get': needStorage(); return storage.get(String(args[0]));
      case 'storage.set': {
        needStorage();
        return storage.set(String(args[0]), args[1]);
      }
      case 'storage.delete': needStorage(); return storage.delete(String(args[0]));
      default:
        if (CALLS[method]) return volathCall(method, args || []);
        throw new Error(`Unknown call ${method}`);
    }
  }

  /** Runs the manifest `actions` that match the event; returns what each did, for the activity log of the plugin. */
  async function runActions(event) {
    const results = [];
    for (const action of manifest.actions || []) {
      if (action.on !== event.type) continue;
      const scope = { event, settings, plugin: { id: manifest.id, version: manifest.version } };
      if (action.when && !Object.entries(action.when).every(([path, expected]) => String(lookup(scope, path.startsWith('event.') || path.startsWith('settings.') ? path : `event.${path}`)) === String(expected))) continue;
      if (action.call) {
        // An action that asks Volath to do something (create a developer, a custom field...) instead of calling an API
        const rendered = render(action.args === undefined ? [] : action.args, scope);
        try {
          await volathCall(action.call, Array.isArray(rendered) ? rendered : [rendered]);
          results.push({ on: action.on, url: action.call, status: 200, ok: true });
        } catch (err) {
          results.push({ on: action.on, url: action.call, status: 0, ok: false, error: err.message });
        }
        continue;
      }
      const { method, url, headers, body } = render(action.http, scope);
      try {
        const res = await fetchAllowed(String(url), { method, headers, body });
        results.push({ on: action.on, url: String(url), status: res.status, ok: res.ok });
      } catch (err) {
        results.push({ on: action.on, url: String(url), status: 0, ok: false, error: err.message });
      }
    }
    return results;
  }

  return { rpc, runActions };
}

module.exports = { createBroker, render, lookup };
