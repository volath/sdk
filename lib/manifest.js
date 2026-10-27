'use strict';
/**
 * Volath plugin manifest (plugin.json): constants and validator. Plain CommonJS without dependencies, so the same file
 * is used by the server when a zip is installed and by the plugin tool (cli.js) on the author's machine.
 */

const API_VERSION = 1;

/** Events a plugin can subscribe to (same names as webhooks). */
const EVENTS = [
  'ticket.status_changed', 'pr.opened', 'test.finished', 'ci.failed', 'deploy.finished', 'budget.exceeded', 'approval.requested',
  'digest', 'ticket.updated', 'ticket.deleted', 'ticket.timeline', 'ticket.activity', 'ai.job', 'notification',
  'ticket.reverted', 'release.published', 'workflow.notify',
  'ticket.created', 'ticket.comment_added', 'project.created', 'project.updated', 'project.deleted',
  'developer.created', 'developer.updated', 'customfield.created', 'customfield.updated', 'customfield.deleted',
  'workflow.updated',
];

/** entity.<table>.created|updated|deleted: every row written to the database (entity.users.updated, entity.agents.created...) */
const ENTITY_EVENT = /^entity.[a-z_]+.(created|updated|deleted)$/;
const isEvent = (e) => EVENTS.includes(e) || ENTITY_EVENT.test(e);

/**
 * What a plugin can ask Volath to do, besides ctx.http and ctx.storage: "namespace.function" -> [permission, level].
 * The same table decides which ctx functions exist, what the broker checks and what an action `call` may name.
 * Levels: "read" < "write" < "admin" (see LEVEL_PERMISSIONS); a permission that is just true (notifications) has no level.
 * projects.create / projects.update need "write", but a folder, project settings and a workflow only work with "admin" (and "workflows": "write"
 * for the workflow); the server checks those arguments.
 */
const CALLS = {
  'tickets.list': ['tickets', 'read'], 'tickets.get': ['tickets', 'read'], 'tickets.comments': ['tickets', 'read'],
  'tickets.create': ['tickets', 'write'], 'tickets.update': ['tickets', 'write'], 'tickets.setStatus': ['tickets', 'write'], 'tickets.comment': ['tickets', 'write'],
  'projects.list': ['projects', 'read'], 'projects.get': ['projects', 'read'],
  'projects.create': ['projects', 'write'], 'projects.update': ['projects', 'write'],
  'workflows.get': ['workflows', 'read'], 'workflows.effective': ['workflows', 'read'], 'workflows.defaults': ['workflows', 'read'],
  'workflows.save': ['workflows', 'write'], 'workflows.reset': ['workflows', 'write'],
  'workflows.catalogList': ['workflows', 'read'], 'workflows.catalogPublish': ['workflows', 'write'], 'workflows.catalogRemove': ['workflows', 'write'], 'workflows.catalogApply': ['workflows', 'write'],
  'developers.list': ['developers', 'read'],
  'developers.add': ['developers', 'write'], 'developers.update': ['developers', 'write'], 'developers.remove': ['developers', 'write'],
  'webhooks.list': ['webhooks', 'read'],
  'webhooks.create': ['webhooks', 'write'], 'webhooks.update': ['webhooks', 'write'], 'webhooks.remove': ['webhooks', 'write'],
  'users.list': ['users', 'read'], 'users.get': ['users', 'read'], 'users.update': ['users', 'write'],
  'tickets.git': ['tickets', 'read'], 'tickets.timeline': ['tickets', 'read'], 'tickets.attachments': ['tickets', 'read'],
  'agents.list': ['agents', 'read'], 'agents.get': ['agents', 'read'], 'agents.create': ['agents', 'write'], 'agents.update': ['agents', 'write'],
  'skills.list': ['skills', 'read'], 'skills.get': ['skills', 'read'], 'skills.create': ['skills', 'write'], 'skills.update': ['skills', 'write'],
  'squads.list': ['squads', 'read'], 'squads.get': ['squads', 'read'], 'squads.create': ['squads', 'write'], 'squads.update': ['squads', 'write'],
  'documents.list': ['documents', 'read'], 'documents.get': ['documents', 'read'], 'documents.create': ['documents', 'write'], 'documents.update': ['documents', 'write'],
  'documents.attach': ['documents', 'write'], 'documents.detach': ['documents', 'write'],
  'ticketTemplates.list': ['ticketTemplates', 'read'], 'ticketTemplates.get': ['ticketTemplates', 'read'], 'ticketTemplates.create': ['ticketTemplates', 'write'], 'ticketTemplates.update': ['ticketTemplates', 'write'],
  'boardViews.list': ['boardViews', 'read'], 'boardViews.create': ['boardViews', 'write'], 'boardViews.update': ['boardViews', 'write'],
  'customFields.list': ['customFields', 'read'],
  'customFields.create': ['customFields', 'write'], 'customFields.update': ['customFields', 'write'],
  'notifications.create': ['notifications', true],
  // ctx.actions.*: each one is its own entry of permissions.actions ("analyze", "develop"...), or actions: true for all of them
  'actions.analyze': ['actions', 'analyze'], 'actions.develop': ['actions', 'develop'], 'actions.stop': ['actions', 'stop'],
  'actions.pullRequest': ['actions', 'pullRequest'], 'actions.runTests': ['actions', 'tests'], 'actions.merge': ['actions', 'merge'],
  'actions.approve': ['actions', 'approve'], 'actions.reject': ['actions', 'approve'],
  'actions.resumeJob': ['actions', 'jobs'], 'actions.cancelJob': ['actions', 'jobs'],
};

/**
 * Permissions that list what they allow: true (all of it) or a list of names. actions: what ctx.actions may start; prompts: the AI runs a plugin
 * may append text to (permissions.prompts + the manifest's promptAppend, or onPrompt in the code).
 */
const ITEM_PERMISSIONS = {
  actions: ['analyze', 'develop', 'stop', 'pullRequest', 'tests', 'merge', 'approve', 'jobs'],
  prompts: ['analysis', 'development', 'review', 'pr_description', 'merge_conflict', 'live_test', 'release_notes'],
};

/**
 * Permissions that take a level, from the lowest: each level includes the ones before it. users "write" edits a person's profile (never the email or the password) and "admin" also their role and projects; a plugin never creates
 * accounts that can sign in. projects "admin" also lets it set the folder and the settings of a project, which is what makes Volath
 * run git and AI agents there; workflows "write" replaces the workflow of any project, and the tickets of a step that is gone go back to To Do.
 */
const LEVEL_PERMISSIONS = {
  tickets: ['read', 'write'], projects: ['read', 'write', 'admin'], developers: ['read', 'write'], users: ['read', 'write', 'admin'],
  agents: ['read', 'write'], skills: ['read', 'write'], squads: ['read', 'write'], documents: ['read', 'write'], ticketTemplates: ['read', 'write'], boardViews: ['read', 'write'],
  customFields: ['read', 'write'], workflows: ['read', 'write'], webhooks: ['read', 'write'],
};

/** Whether a granted level reaches the level a call needs. */
const reaches = (name, have, need) => {
  const levels = LEVEL_PERMISSIONS[name] || [];
  return levels.indexOf(have) >= 0 && levels.indexOf(have) >= levels.indexOf(need);
};

const SETTING_TYPES = ['text', 'password', 'number', 'toggle', 'select'];
const ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
const HOST = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;
const EVERY = /^(\d{1,4})(m|h|d)$/;

/** Where a plugin can put something in the interface (ui.slots). menu needs a page (entry); the others may also be plain text or links. */
const SLOTS = ['topbar', 'menu', 'board', 'ticket.tab', 'ticket.panel', 'project.tab'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const safeRelative = (p) => typeof p === 'string' && p.length > 0 && p.length < 200 && !p.startsWith('/') && !p.includes('\\') && !p.includes(':') && !p.split('/').some((s) => s === '..' || s === '');

/** Whether the hosts a manifest lets the plugin reach (permissions.network) include this one. */
function allowsHost(allowed, host) {
  const h = String(host).toLowerCase();
  return (allowed || []).some((a) => {
    const p = String(a).toLowerCase();
    return p.startsWith('*.') ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p;
  });
}

/** Whether the permissions of a manifest allow one of the CALLS. */
function grants(perms, call) {
  const need = CALLS[call];
  if (!need || !isObject(perms)) return false;
  const [name, level] = need;
  if (ITEM_PERMISSIONS[name]) return perms[name] === true || (Array.isArray(perms[name]) && perms[name].includes(level));
  if (level === true) return perms[name] === true;
  return reaches(name, perms[name], level);
}

/**
 * @param {unknown} raw parsed plugin.json
 * @returns {{ ok: boolean, errors: string[], warnings: string[], manifest: object | null }}
 */
function validateManifest(raw) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  if (!isObject(raw)) return { ok: false, errors: ['plugin.json must be a JSON object'], warnings, manifest: null };
  const m = raw;

  if (typeof m.id !== 'string' || !ID.test(m.id)) err('id: 2-40 characters, lowercase letters, digits and dashes, starting with a letter or digit (e.g. "acme-dashboard")');
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 60) err('name: required text, up to 60 characters');
  if (typeof m.version !== 'string' || !VERSION.test(m.version)) err('version: semantic version like "1.0.0"');
  if (m.apiVersion !== API_VERSION) err(`apiVersion: must be ${API_VERSION}`);
  for (const k of ['description', 'author', 'homepage', 'volath']) {
    if (m[k] !== undefined && (typeof m[k] !== 'string' || m[k].length > 500)) err(`${k}: must be text`);
  }
  if (m.logo !== undefined && (!safeRelative(m.logo) || !/.(png|jpe?g|webp|svg)$/i.test(m.logo))) err('logo: relative path of a .png, .jpg, .webp or .svg image inside the zip (e.g. "logo.png")');
  if (m.main !== undefined && (!safeRelative(m.main) || !/\.c?js$/.test(m.main))) err('main: relative path of a .js file inside the zip (e.g. "index.js")');

  const perms = m.permissions === undefined ? {} : m.permissions;
  if (!isObject(perms)) err('permissions: must be an object');
  else {
    for (const k of Object.keys(perms)) if (!['network', 'events', 'storage', 'notifications', ...Object.keys(LEVEL_PERMISSIONS), ...Object.keys(ITEM_PERMISSIONS)].includes(k)) err(`permissions.${k}: unknown permission`);
    if (perms.network !== undefined) {
      if (!Array.isArray(perms.network) || perms.network.some((h) => typeof h !== 'string' || !HOST.test(h))) err('permissions.network: list of host names such as "api.acme.com" or "*.acme.com" (no http://, no path)');
      else if (perms.network.some((h) => h.startsWith('*.') && h.split('.').length < 3)) err('permissions.network: a wildcard must name a domain, e.g. "*.acme.com"');
    }
    for (const [k, levels] of Object.entries(LEVEL_PERMISSIONS)) {
      if (perms[k] !== undefined && !levels.includes(perms[k])) err(`permissions.${k}: ${levels.map((l) => `"${l}"`).join(' or ')}`);
    }
    if (perms.notifications !== undefined && typeof perms.notifications !== 'boolean') err('permissions.notifications: true or false');
    for (const [k, items] of Object.entries(ITEM_PERMISSIONS)) {
      if (perms[k] !== undefined && perms[k] !== true && (!Array.isArray(perms[k]) || perms[k].some((i) => !items.includes(i)))) err(`permissions.${k}: true or a list of ${items.join(', ')}`);
    }
    if (perms.events !== undefined) {
      if (!Array.isArray(perms.events) || perms.events.some((e) => e !== '*' && !isEvent(e))) err(`permissions.events: list of ${EVENTS.join(', ')}, entity.<table>.created|updated|deleted, or "*"`);
    }
    if (perms.storage !== undefined && typeof perms.storage !== 'boolean') err('permissions.storage: true or false');
  }

  const settings = m.settings === undefined ? [] : m.settings;
  if (!Array.isArray(settings)) err('settings: must be a list');
  else {
    const seen = new Set();
    settings.forEach((f, i) => {
      const at = `settings[${i}]`;
      if (!isObject(f)) return err(`${at}: must be an object`);
      if (typeof f.key !== 'string' || !KEY.test(f.key)) err(`${at}.key: letters, digits and underscores, starting with a letter`);
      else if (seen.has(f.key)) err(`${at}.key: "${f.key}" is used twice`);
      else seen.add(f.key);
      if (typeof f.label !== 'string' || !f.label.trim()) err(`${at}.label: required text`);
      if (!SETTING_TYPES.includes(f.type)) err(`${at}.type: one of ${SETTING_TYPES.join(', ')}`);
      if (f.type === 'select' && (!Array.isArray(f.options) || !f.options.length || f.options.some((o) => !isObject(o) || typeof o.value !== 'string' || typeof o.label !== 'string'))) err(`${at}.options: list of { "value": "...", "label": "..." } for a select`);
      if (f.required !== undefined && typeof f.required !== 'boolean') err(`${at}.required: true or false`);
      const textual = f.type === 'text' || f.type === 'password';
      for (const k of ['pattern', 'minLength', 'maxLength']) if (f[k] !== undefined && !textual) err(`${at}.${k}: only for a text or password field`);
      for (const k of ['min', 'max']) if (f[k] !== undefined && f.type !== 'number') err(`${at}.${k}: only for a number field`);
      if (f.pattern !== undefined) {
        if (typeof f.pattern !== 'string' || f.pattern.length > 300) err(`${at}.pattern: a regular expression of at most 300 characters`);
        else { try { new RegExp(f.pattern); } catch { err(`${at}.pattern: not a valid regular expression`); } }
      }
      for (const k of ['minLength', 'maxLength']) if (f[k] !== undefined && (!Number.isInteger(f[k]) || f[k] < 0 || f[k] > 2000)) err(`${at}.${k}: a whole number from 0 to 2000`);
      for (const k of ['min', 'max']) if (f[k] !== undefined && !Number.isFinite(f[k])) err(`${at}.${k}: a number`);
      if (f.minLength !== undefined && f.maxLength !== undefined && f.minLength > f.maxLength) err(`${at}: minLength is bigger than maxLength`);
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) err(`${at}: min is bigger than max`);
    });
  }

  if (m.ui !== undefined) {
    if (!isObject(m.ui)) err('ui: must be an object');
    else {
      const slots = m.ui.slots === undefined ? [] : m.ui.slots;
      // The page (entry + title) is optional when the plugin only puts things into slots
      if (m.ui.entry !== undefined || !Array.isArray(slots) || !slots.length) {
        if (!safeRelative(m.ui.entry) || !/\.html?$/.test(m.ui.entry)) err('ui.entry: relative path of an .html file inside the zip (e.g. "ui/index.html")');
        if (typeof m.ui.title !== 'string' || !m.ui.title.trim()) err('ui.title: required text');
      }
      if (m.ui.icon !== undefined && typeof m.ui.icon !== 'string') err('ui.icon: name of a Lucide icon, e.g. "LayoutDashboard"');
      if (!Array.isArray(slots) || slots.length > 20) err('ui.slots: a list of up to 20 { slot, title, entry | text | links }');
      else {
        slots.forEach((s, i) => {
          const at = `ui.slots[${i}]`;
          if (!isObject(s)) return err(`${at}: must be an object`);
          if (!SLOTS.includes(s.slot)) err(`${at}.slot: one of ${SLOTS.join(', ')}`);
          if (typeof s.title !== 'string' || !s.title.trim() || s.title.length > 60) err(`${at}.title: required text, up to 60 characters`);
          if (s.icon !== undefined && typeof s.icon !== 'string') err(`${at}.icon: name of a Lucide icon`);
          if (s.height !== undefined && !(Number.isInteger(s.height) && s.height >= 40 && s.height <= 1200)) err(`${at}.height: whole number of pixels, 40 to 1200`);
          const kinds = ['entry', 'text', 'links'].filter((k) => s[k] !== undefined);
          if (kinds.length !== 1) err(`${at}: give exactly one of "entry" (an html page), "text" or "links"`);
          if (s.entry !== undefined && (!safeRelative(s.entry) || !/\.html?$/.test(s.entry))) err(`${at}.entry: relative path of an .html file inside the zip`);
          if (s.text !== undefined && (typeof s.text !== 'string' || s.text.length > 1000)) err(`${at}.text: text up to 1000 characters`);
          if (s.links !== undefined && (!Array.isArray(s.links) || s.links.length > 8 || s.links.some((l) => !isObject(l) || typeof l.label !== 'string' || !/^https?:\/\//.test(l.url)))) err(`${at}.links: up to 8 { label, url } with an http(s) url`);
          if (s.slot === 'menu' && s.entry === undefined) err(`${at}: a menu item opens a page, so it needs "entry"`);
        });
      }
    }
  }

  const actions = m.actions === undefined ? [] : m.actions;
  if (!Array.isArray(actions)) err('actions: must be a list');
  else {
    actions.forEach((a, i) => {
      const at = `actions[${i}]`;
      if (!isObject(a)) return err(`${at}: must be an object`);
      if (!isEvent(a.on)) err(`${at}.on: one of ${EVENTS.join(', ')} or entity.<table>.created|updated|deleted`);
      else if (!isObject(perms) || !Array.isArray(perms.events) || (!perms.events.includes('*') && !perms.events.includes(a.on))) err(`${at}.on: add "${a.on}" to permissions.events`);
      if (a.when !== undefined && (!isObject(a.when) || Object.values(a.when).some((v) => typeof v === 'object' && v !== null))) err(`${at}.when: object of "path": value (text, number or true/false) that must all match`);
      if (a.call !== undefined) {
        if (a.http !== undefined) return err(`${at}: use either "http" or "call", not both`);
        if (!CALLS[a.call]) return err(`${at}.call: one of ${Object.keys(CALLS).join(', ')}`);
        if (!grants(perms, a.call)) err(`${at}.call: "${a.call}" needs permissions.${CALLS[a.call][0]}${CALLS[a.call][1] === true ? ': true' : `: "${CALLS[a.call][1]}"`}`);
        if (a.args !== undefined && (a.args === null || typeof a.args !== 'object')) err(`${at}.args: an object, or a list of arguments (placeholders such as {{event.ticket.id}} work in the values)`);
        return;
      }
      if (!isObject(a.http)) return err(`${at}.http: required object { method, url, headers?, body? }, or use "call" to ask Volath to do something`);
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(a.http.method)) err(`${at}.http.method: GET, POST, PUT, PATCH or DELETE`);
      if (typeof a.http.url !== 'string' || !/^(https?:\/\/|\{\{settings\.\w+\}\})/i.test(a.http.url)) err(`${at}.http.url: must start with https:// (or with a {{settings.baseUrl}} placeholder)`);
      else {
        const host = /^https?:\/\/([^/{}?#]+)/i.exec(a.http.url);
        if (host && isObject(perms) && !allowsHost(perms.network, host[1])) err(`${at}.http.url: host "${host[1]}" is missing from permissions.network`);
        if (/^http:\/\//i.test(a.http.url)) warnings.push(`${at}.http.url: plain http is sent unencrypted`);
      }
    });
  }

  const schedule = m.schedule === undefined ? [] : m.schedule;
  if (!Array.isArray(schedule)) err('schedule: must be a list');
  else {
    schedule.forEach((s, i) => {
      if (!isObject(s) || !EVERY.test(String(s.every)) || typeof s.task !== 'string' || !KEY.test(s.task)) err(`schedule[${i}]: { "every": "15m" (m, h or d), "task": "name" } where task is a function in module.exports.tasks`);
    });
    if (schedule.length && !m.main) err('schedule: needs "main" (the tasks are code)');
  }

  // promptAppend: text added at the END of what Volath tells the AI at a stage (never replacing it); needs permissions.prompts for that stage
  const appends = m.promptAppend === undefined ? [] : m.promptAppend;
  if (!Array.isArray(appends)) err('promptAppend: must be a list');
  else {
    appends.forEach((p, i) => {
      const at = `promptAppend[${i}]`;
      if (!isObject(p) || !ITEM_PERMISSIONS.prompts.includes(p.on) || typeof p.text !== 'string' || !p.text.trim()) return err(`${at}: { "on": one of ${ITEM_PERMISSIONS.prompts.join(', ')}, "text": "what to add" }`);
      const have = isObject(perms) ? perms.prompts : undefined;
      if (have !== true && !(Array.isArray(have) && have.includes(p.on))) err(`${at}: add "${p.on}" to permissions.prompts`);
    });
  }
  if (!m.main && !m.ui && !(Array.isArray(actions) && actions.length) && !appends.length) err('The plugin does nothing: add "main" (code), "ui" (a page) or "actions" (calls to an API or to Volath)');
  // webhooks: the addresses outside systems may call (api/plugin-hooks/<id>/<name>); the secret of each is made by Volath
  const hooks = m.webhooks === undefined ? [] : m.webhooks;
  if (!Array.isArray(hooks)) err('webhooks: must be a list');
  else {
    const seenHook = new Set();
    hooks.forEach((h, i) => {
      if (!isObject(h) || typeof h.name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(h.name)) return err(`webhooks[${i}]: { "name": "lowercase-with-dashes", "description": "optional" }`);
      if (seenHook.has(h.name)) err(`webhooks[${i}].name: "${h.name}" is used twice`);
      seenHook.add(h.name);
      if (h.description !== undefined && (typeof h.description !== 'string' || h.description.length > 300)) err(`webhooks[${i}].description: text up to 300 characters`);
    });
    if (hooks.length && !m.main) err('webhooks: needs "main" (the requests are answered by onWebhook(req, ctx))');
  }

  const known = new Set(['id', 'name', 'version', 'apiVersion', 'description', 'author', 'homepage', 'logo', 'volath', 'main', 'permissions', 'settings', 'ui', 'actions', 'schedule', 'webhooks', 'promptAppend']);
  for (const k of Object.keys(m)) if (!known.has(k)) warnings.push(`${k}: unknown field, ignored`);

  return { ok: errors.length === 0, errors, warnings, manifest: errors.length ? null : m };
}

/** "15m" / "2h" / "1d" in milliseconds. */
function everyMs(every) {
  const [, n, unit] = EVERY.exec(every);
  return Number(n) * { m: 60000, h: 3600000, d: 86400000 }[unit];
}

module.exports = { API_VERSION, SLOTS, EVENTS, isEvent, CALLS, LEVEL_PERMISSIONS, ITEM_PERMISSIONS, SETTING_TYPES, validateManifest, allowsHost, everyMs, safeRelative, grants, reaches };
