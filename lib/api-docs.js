'use strict';
/**
 * The machine-readable description of the plugin API: what a plugin can call (`calls`), receive (`events`), declare (`manifest`),
 * export (`hooks`) and find on `ctx` (`ctx`). The SDK is GENERATED from this file (TypeScript types, JSON Schema, the AI guide, the reference),
 * so a function or event that exists but is not described here fails api-docs.test.js.
 *
 * Shapes were written from the implementation (plugins.service.ts volathApi, plugins/api/*.ts, the services that publish events),
 * not from the guide. Types are TypeScript source strings; `Foo?` after a name in `fields`/`params` marks it optional.
 */
const { API_VERSION, EVENTS, CALLS, LEVEL_PERMISSIONS, ITEM_PERMISSIONS, SETTING_TYPES, SLOTS } = require('./manifest');

// ---- small builders ------------------------------------------------------------------------------------------------------------------

/** A parameter: p('projectId', 'string', 'what it is'); a name ending in ? is optional */
const p = (name, type, description = '') => ({ name: name.replace(/\?$/, ''), type, optional: name.endsWith('?'), description });
/** A call: fn(summary, [params], returns, { notes, example }) */
const fn = (summary, params, returns, extra = {}) => ({ summary, params, returns, ...extra });

// ---- shared types --------------------------------------------------------------------------------------------------------------------

/** name -> { description, fields: { 'name?': 'TS type' } }. `extends` names another type whose fields come first. */
const types = {
  CustomValues: { alias: 'Record<string, string | number | boolean>', description: 'Custom field values by field code' },
  Ticket: {
    description: 'A ticket as a plugin sees it (never its settings, which hold credentials)',
    fields: {
      id: 'string', ticketNumber: 'number', title: 'string', description: 'string', type: "'Feature' | 'Bugfix' | 'Hotfix'", status: 'string (a step of the project workflow)',
      projectId: 'string', developerId: 'string | null', assignedDeveloper: 'string | null', parentTicketId: 'string | null', customFields: 'CustomValues',
    },
  },
  TicketComment: { description: 'A comment on a ticket', fields: { id: 'string', author: 'string', content: 'string', createdAt: 'string (ISO date)' } },
  TicketGit: {
    description: 'The git side of a ticket',
    fields: { branch: 'string | null', pullRequest: '{ number: number; url: string | null; status: string | null; title: string | null; description: string | null } | null' },
  },
  TimelineEntry: { description: 'One line of the ticket timeline, oldest first', fields: { id: 'string', icon: 'string', title: 'string', commit: 'string | null', at: 'string (ISO date)' } },
  Attachment: { description: 'A document attached to a ticket', fields: { id: 'string', kind: 'DocumentKind', title: 'string', url: 'string | null', fileName: 'string | null', size: 'number' } },
  Project: {
    description: 'A project (never its folder on disk or its settings)',
    fields: { id: 'string', name: 'string', description: 'string', active: 'boolean', origin: 'string | null', customFields: 'CustomValues' },
  },
  Developer: {
    description: 'A member of a project: a person (user) on that project. `id` is the membership id, which developers.update/remove take',
    fields: {
      id: 'string', projectId: 'string', userId: 'string', name: 'string', githubUsername: 'string | null', role: 'string | null',
      avatarUrl: 'string | null', active: 'boolean', hasLogin: 'boolean', customFields: 'CustomValues', createdAt: 'string (ISO date)', updatedAt: 'string (ISO date)',
    },
  },
  User: {
    description: 'A person with an account. Never the email or a password',
    fields: {
      id: 'string', name: 'string', githubUsername: 'string | null', avatarUrl: 'string | null', hasLogin: 'boolean', roleId: 'string', role: 'string', active: 'boolean',
      projectIds: 'string[] | null (null = all projects)', language: 'string', customFields: 'CustomValues',
    },
  },
  CustomField: {
    description: 'The definition of a custom field',
    fields: { id: 'string', code: 'string', name: 'string', description: 'string', entityType: "'ticket' | 'project' | 'user'", fieldType: "'text' | 'number' | 'boolean' | 'date' | 'select'", options: 'string[] | null' },
  },
  WorkflowAction: {
    description: 'What a step does when a ticket enters it',
    fields: {
      type: "'analyze' | 'develop' | 'create_pr' | 'check_ci' | 'review' | 'merge_staging' | 'run_tests' | 'merge' | 'comment' | 'notify' | 'request_approval' | 'security_scan' | 'wait'",
      'auto?': 'boolean (merge: merge by itself)', 'text?': 'string (comment / notify / request_approval)', 'minutes?': 'number (wait)',
    },
  },
  WorkflowNode: {
    description: 'A step of a workflow; its `status` is the status of the tickets in it. The steps "To Do" and "Done" are required',
    fields: {
      id: 'string (n0, n1... by position)', status: 'string', 'color?': 'string', 'kind?': "'step' | 'decision' | 'parallel' | 'gate'", 'note?': 'string', actions: 'WorkflowAction[]',
      'done?': 'boolean', 'trackerState?': 'string', 'autostart?': 'boolean', 'hidden?': 'boolean', x: 'number', y: 'number',
    },
  },
  WorkflowEdge: {
    description: 'An arrow between two steps; all its conditions must hold',
    fields: {
      id: 'string', from: 'string (node id)', to: 'string (node id)', auto: 'boolean (taken by itself once the conditions hold)',
      conditions: "Array<{ type: 'approvals' | 'no_changes_requested' | 'ci_passed' | 'has_pull_request' | 'ticket_type' | 'analysis_viable' | 'analysis_not_viable' | 'development_done' | 'deployed' | 'tests_passed' | 'approved' | 'scan_passed' | 'scan_failed' | 'waited'; value?: number | string }>",
    },
  },
  WorkflowGraph: { description: 'The steps and arrows of a workflow', fields: { 'name?': 'string', nodes: 'WorkflowNode[]', edges: 'WorkflowEdge[]' } },
  WorkflowInput: { description: 'A workflow you hand over: "default" (the built-in pipeline), "local" (no remote repository) or your own graph', alias: "'default' | 'local' | WorkflowGraph" },
  Workflow: { description: 'A saved workflow', fields: { id: 'string', projectId: 'string | null (null = the general template)', name: 'string', nodes: 'WorkflowNode[]', edges: 'WorkflowEdge[]' } },
  EffectiveWorkflow: { description: 'The workflow a project follows', fields: { source: "'project' | 'general'", workflow: 'Workflow', statuses: 'string[]' } },
  CatalogEntry: { description: 'A workflow of the catalog (built-in ones have builtin: true)', fields: { id: 'string', name: 'string', description: 'string', builtin: 'boolean', steps: 'string[]' } },
  Agent: {
    description: 'An AI agent of a project',
    fields: {
      id: 'string', projectId: 'string', name: 'string', role: 'string | null', color: 'string | null', instructions: 'string', aiProvider: 'string | null', aiModel: 'string | null',
      skillIds: 'string[]', active: 'boolean', createdAt: 'string (ISO date)', updatedAt: 'string (ISO date)',
    },
  },
  Skill: { description: 'A skill agents can use', fields: { id: 'string', projectId: 'string', name: 'string', description: 'string', instructions: 'string', active: 'boolean', createdAt: 'string (ISO date)', updatedAt: 'string (ISO date)' } },
  Squad: {
    description: 'A team of agents with a leader',
    fields: {
      id: 'string', projectId: 'string', name: 'string', color: 'string | null', leaderAgentId: 'string', members: 'Array<{ agentId: string; role: string }> | null', instructions: 'string',
      maxSteps: 'number', active: 'boolean', createdAt: 'string (ISO date)', updatedAt: 'string (ISO date)',
    },
  },
  DocumentKind: { alias: "'file' | 'image' | 'audio' | 'video' | 'text' | 'link' | 'figma'", description: 'What a project document is' },
  Document: {
    description: 'A note or link of a project (the path of a stored file never leaves)',
    fields: {
      id: 'string', projectId: 'string', kind: 'DocumentKind', title: 'string', url: 'string | null', text: 'string (the note, or what Volath read from the link/file)', size: 'number',
      folderId: 'string | null', fileName: 'string | null', createdAt: 'string (ISO date)',
    },
  },
  TicketTemplate: {
    description: 'A template tickets are made from',
    fields: {
      id: 'string', projectId: 'string', name: 'string', title: 'string', description: 'string', type: 'string', validationCriteria: 'unknown[] | null', agentId: 'string | null', squadId: 'string | null',
      aiProviderOverride: 'string | null', aiModelOverride: 'string | null', labels: 'string[] | null', customFields: 'CustomValues | null', scheduleCron: 'string | null', scheduleEnabled: 'boolean',
      lastRunAt: 'string | null', lastTicketId: 'string | null', createdAt: 'string (ISO date)', updatedAt: 'string (ISO date)',
    },
  },
  BoardViewFilters: {
    description: 'The filters a board view pins',
    fields: { 'search?': 'string', 'assignee?': 'string', 'provider?': 'string', 'status?': 'string', 'label?': 'string', 'tag?': 'string', 'ci?': "'failed' | 'passed' | 'pending' | 'stopped' | 'none'", 'minSpend?': 'number | null' },
  },
  BoardView: {
    description: 'A named set of board filters shown as a tab; views made by a plugin are shared with everybody',
    fields: { id: 'string', projectId: 'string', name: 'string', filters: 'BoardViewFilters', shared: 'boolean', createdAt: 'string (ISO date)', updatedAt: 'string (ISO date)' },
  },
  Webhook: {
    description: 'A webhook Volath sends to another system. Secrets are never returned',
    fields: {
      id: 'string', projectId: 'string', name: 'string', url: 'string', format: "'json' | 'slack' | 'teams'", events: 'string[] | null (null = all)', enabled: 'boolean',
      hasSecret: 'boolean', hasChatSecret: 'boolean', 'chatApprovers?': 'string[] | null', 'createdByThisPlugin?': 'boolean (webhooks.list only)', createdAt: 'string (ISO date)',
    },
  },
  HttpResponse: {
    description: 'What ctx.http.fetch returns. A non-2xx answer does not throw: check `ok`',
    fields: { status: 'number', ok: 'boolean', headers: 'Record<string, string>', body: 'string (the text of the response)', json: 'unknown (parsed body, or null when it is not JSON)' },
  },
  ActionResult: { description: 'What ctx.actions functions return', fields: { ok: 'true', ticketId: 'string', status: 'string', 'alreadyRunning?': 'boolean (develop)', 'runId?': 'string (runTests)' } },
};

// ---- calls -------------------------------------------------------------------------------------------------------------------------------

const PID = p('projectId', 'string', 'The project id');
const TID = p('ticketId', 'string', 'The ticket id');
const ENTITY_ID = (what) => p(`${what}Id`, 'string', `The ${what} id`);

/** Every key of CALLS, described. `permission` is derived from CALLS below. */
const callDocs = {
  // tickets
  'tickets.list': fn('Recent tickets, newest first', [p('query?', '{ projectId?: string; status?: string; limit?: number }', 'limit: 1-200, default 50')], 'Ticket[]'),
  'tickets.get': fn('One ticket, or null', [TID], 'Ticket | null'),
  'tickets.comments': fn('The comments of a ticket', [TID], 'TicketComment[]'),
  'tickets.create': fn(
    'Creates a ticket (its workflow, numbering and events run as for a person)',
    [p('ticket', "{ title: string; projectId: string; description?: string; type?: 'Feature' | 'Bugfix' | 'Hotfix'; customFields?: CustomValues; developerId?: string; parentTicketId?: string }", 'title is cut to 300 characters; ctx.projectId is set when handling an event')],
    'Ticket',
  ),
  'tickets.update': fn('Changes a ticket; only the fields you pass change (a custom field set to null is cleared)', [TID, p('patch', '{ title?: string; description?: string; customFields?: Record<string, string | number | boolean | null>; developerId?: string; assignedDeveloper?: string }')], 'Ticket'),
  'tickets.setStatus': fn('Moves a ticket to a step of its workflow. A move the workflow does not allow throws', [TID, p('status', 'string')], 'Ticket'),
  'tickets.comment': fn('Adds a comment signed "Plugin: <name>" (up to 5000 characters)', [TID, p('text', 'string')], '{ id: string }'),
  'tickets.git': fn('The branch and pull request of a ticket', [TID], 'TicketGit'),
  'tickets.timeline': fn('The timeline of a ticket, oldest first', [TID], 'TimelineEntry[]'),
  'tickets.attachments': fn('The documents attached to a ticket', [TID], 'Attachment[]'),
  // projects
  'projects.list': fn('All projects', [], 'Project[]'),
  'projects.get': fn('One project, or null', [PID], 'Project | null'),
  'projects.create': fn(
    'Creates a project',
    [p('project', '{ name: string; description?: string; customFields?: CustomValues; repositoryPath?: string; settings?: Record<string, unknown>; createFolder?: boolean; workflow?: WorkflowInput }', 'repositoryPath, settings and createFolder need projects: "admin"; workflow needs workflows: "write"')],
    'Project',
    { notes: 'The folder (repositoryPath) is where Volath runs git and the AI; with createFolder Volath creates it and runs git init. An invalid workflow refuses the whole call before anything is created.' },
  ),
  'projects.update': fn('Changes a project. Same extra arguments as projects.create', [PID, p('patch', '{ name?: string; description?: string; active?: boolean; customFields?: CustomValues; repositoryPath?: string; settings?: Record<string, unknown>; workflow?: WorkflowInput }')], 'Project'),
  // workflows
  'workflows.get': fn('The workflow saved for exactly this project (null when it follows the general template); without a project id, the general template', [p('projectId?', 'string')], 'Workflow | null'),
  'workflows.effective': fn('The workflow a project follows (its own, else the general template)', [p('projectId?', 'string')], 'EffectiveWorkflow'),
  'workflows.defaults': fn('The built-in pipeline as a graph, to start from', [], 'WorkflowGraph'),
  'workflows.save': fn(
    'Replaces the workflow of a project (null: the general template)',
    [p('projectId', 'string | null'), p('workflow', 'WorkflowInput')],
    'Workflow',
    { notes: 'A ticket stays when its status is a step of the new workflow; the others go back to To Do (no step is ever read as a rename). Prefer workflows.catalogApply to install a published workflow.' },
  ),
  'workflows.reset': fn('The project follows the general template again', [PID], '{ ok: true }'),
  'workflows.catalogList': fn('The catalog: built-in workflows plus the ones people and plugins published', [], 'CatalogEntry[]'),
  'workflows.catalogPublish': fn('Adds a workflow to the catalog (it carries this plugin\'s badge)', [p('workflow', 'WorkflowInput'), p('description?', 'string')], '{ id: string; name: string; steps: string[] }'),
  'workflows.catalogRemove': fn('Removes a catalog entry. Only entries this plugin published itself', [p('entryId', 'string')], '{ ok: true }'),
  'workflows.catalogApply': fn('Gives a project (null: the general template) its own copy of a catalog entry; tickets in steps the entry lacks go back to To Do', [p('entryId', 'string'), p('projectId?', 'string | null')], 'Workflow'),
  // developers
  'developers.list': fn('The developers (project members) of a project, or of all projects', [p('projectId?', 'string')], 'Developer[]'),
  'developers.add': fn(
    'Adds a person to a project: found by userId or email, else created without a login',
    [p('developer', '{ projectId: string; name: string; userId?: string; email?: string; githubUsername?: string; role?: string }')],
    'Developer',
  ),
  'developers.update': fn('Changes a developer by developer id (not user id). Email cannot be changed', [ENTITY_ID('developer'), p('patch', '{ name?: string; githubUsername?: string; role?: string; active?: boolean }')], 'Developer'),
  'developers.remove': fn('Removes a developer from a project', [ENTITY_ID('developer')], '{ removed: boolean }'),
  // users
  'users.list': fn('All people with an account (no emails)', [], 'User[]'),
  'users.get': fn('One person, or null', [ENTITY_ID('user')], 'User | null'),
  'users.update': fn(
    'Edits a person\'s profile. Never the email or password; no account is created or deleted',
    [ENTITY_ID('user'), p('patch', '{ name?: string; githubUsername?: string; avatarUrl?: string; active?: boolean; language?: string; customFields?: CustomValues; roleId?: string; projectIds?: string[] | null }', 'roleId and projectIds need users: "admin"')],
    'User',
  ),
  // custom fields
  'customFields.list': fn('Custom field definitions', [p('entityType?', "'ticket' | 'project' | 'user'")], 'CustomField[]'),
  'customFields.create': fn(
    'Creates a custom field definition (never deleted by a plugin: that would erase its values)',
    [p('field', "{ code: string; name: string; entityType: 'ticket' | 'project' | 'user'; fieldType: 'text' | 'number' | 'boolean' | 'date' | 'select'; description?: string; options?: string[] }", 'code: lower-case letters, digits, underscores, 2-40, starting with a letter')],
    'CustomField',
  ),
  'customFields.update': fn('Renames a field or changes its description/options (code, entity type and field type never change)', [ENTITY_ID('field'), p('patch', '{ name?: string; description?: string; options?: string[] }')], 'CustomField'),
  // agents, skills, squads
  'agents.list': fn('The agents of a project', [PID], 'Agent[]'),
  'agents.get': fn('One agent', [ENTITY_ID('agent')], 'Agent'),
  'agents.create': fn('Creates an agent (never deleted by a plugin)', [PID, p('agent', '{ name: string; role?: string; color?: string; instructions?: string; aiProvider?: string; aiModel?: string; skillIds?: string[]; active?: boolean }')], 'Agent'),
  'agents.update': fn('Changes an agent', [ENTITY_ID('agent'), p('patch', 'Partial<{ name: string; role: string; color: string; instructions: string; aiProvider: string; aiModel: string; skillIds: string[]; active: boolean }>')], 'Agent'),
  'skills.list': fn('The skills of a project', [PID], 'Skill[]'),
  'skills.get': fn('One skill', [ENTITY_ID('skill')], 'Skill'),
  'skills.create': fn('Creates a skill', [PID, p('skill', '{ name: string; description?: string; instructions?: string; active?: boolean }')], 'Skill'),
  'skills.update': fn('Changes a skill', [ENTITY_ID('skill'), p('patch', 'Partial<{ name: string; description: string; instructions: string; active: boolean }>')], 'Skill'),
  'squads.list': fn('The squads of a project', [PID], 'Squad[]'),
  'squads.get': fn('One squad', [ENTITY_ID('squad')], 'Squad'),
  'squads.create': fn('Creates a squad', [PID, p('squad', '{ name: string; leaderAgentId?: string; color?: string; members?: Array<{ agentId: string; role: string }>; instructions?: string; maxSteps?: number; active?: boolean }')], 'Squad'),
  'squads.update': fn('Changes a squad', [ENTITY_ID('squad'), p('patch', 'Partial<{ name: string; color: string; leaderAgentId: string; members: Array<{ agentId: string; role: string }>; instructions: string; maxSteps: number; active: boolean }>')], 'Squad'),
  // documents
  'documents.list': fn('The documents of a project', [PID], 'Document[]'),
  'documents.get': fn('One document', [ENTITY_ID('document')], 'Document'),
  'documents.create': fn('Adds a note (kind "text", with text) or a link (kind "link", with url). Files cannot be uploaded', [PID, p('document', "{ kind: 'text' | 'link'; title?: string; text?: string; url?: string; folderId?: string }")], 'Document'),
  'documents.update': fn('Changes a document\'s title, text or folder. Nothing is deleted by a plugin', [ENTITY_ID('document'), p('patch', '{ title?: string; text?: string; folderId?: string }')], 'Document'),
  'documents.attach': fn('Attaches a document to a ticket (same project only)', [TID, ENTITY_ID('document')], 'Document'),
  'documents.detach': fn('Detaches a document from a ticket', [TID, ENTITY_ID('document')], '{ detached: boolean }'),
  // templates, board views
  'ticketTemplates.list': fn('The ticket templates of a project', [PID], 'TicketTemplate[]'),
  'ticketTemplates.get': fn('One template', [ENTITY_ID('template')], 'TicketTemplate'),
  'ticketTemplates.create': fn(
    'Creates a template (making a ticket from one is tickets.create)',
    [PID, p('template', '{ name: string; title: string; description?: string; type?: string; validationCriteria?: unknown[]; agentId?: string; squadId?: string; labels?: string[]; customFields?: CustomValues; scheduleCron?: string; scheduleEnabled?: boolean }')],
    'TicketTemplate',
  ),
  'ticketTemplates.update': fn('Changes a template', [ENTITY_ID('template'), p('patch', 'Partial<TicketTemplate>')], 'TicketTemplate'),
  'boardViews.list': fn('The shared board views of a project', [PID], 'BoardView[]'),
  'boardViews.create': fn('Creates a shared board view', [PID, p('view', '{ name: string; filters?: BoardViewFilters }')], 'BoardView'),
  'boardViews.update': fn('Changes a board view', [ENTITY_ID('view'), p('patch', '{ name?: string; filters?: BoardViewFilters }')], 'BoardView'),
  // webhooks (outbound)
  'webhooks.list': fn('The webhooks of a project (never the secrets)', [PID], 'Webhook[]'),
  'webhooks.create': fn('Creates a webhook (carries this plugin\'s badge)', [PID, p('webhook', "{ url: string; name?: string; format?: 'json' | 'slack' | 'teams'; events?: string[]; enabled?: boolean; secret?: string }", 'secret signs deliveries and is write-only')], 'Webhook'),
  'webhooks.update': fn('Changes a webhook. Only webhooks this plugin created', [ENTITY_ID('webhook'), p('patch', 'Partial<{ url: string; name: string; format: string; events: string[]; enabled: boolean; secret: string }>')], 'Webhook'),
  'webhooks.remove': fn('Removes a webhook. Only webhooks this plugin created', [ENTITY_ID('webhook')], 'unknown'),
  // notifications
  'notifications.create': fn(
    'Puts a notification in the bell ("(<plugin name>)" is appended to the message)',
    [p('notification', "{ title: string; message?: string; level?: 'info' | 'success' | 'warning' | 'error'; ticketId?: string; needsAttention?: boolean }")],
    '{ id: string | null }',
  ),
  // actions
  'actions.analyze': fn('Runs the AI analysis of a ticket in the background', [TID], 'ActionResult'),
  'actions.develop': fn('Starts the AI development, or moves the ticket to the development step of its workflow', [TID], 'ActionResult'),
  'actions.stop': fn('Stops the running development session', [TID], 'ActionResult'),
  'actions.pullRequest': fn('Opens the pull request of the ticket\'s branch', [TID], 'ActionResult'),
  'actions.runTests': fn('Starts a live test', [TID], 'ActionResult & { runId: string }'),
  'actions.merge': fn('Merges the ticket\'s branch into its parent branch', [TID], 'ActionResult'),
  'actions.approve': fn('Answers the approval gate the ticket waits at (throws when nothing waits)', [TID], 'ActionResult'),
  'actions.reject': fn('Rejects the approval gate the ticket waits at', [TID], 'ActionResult'),
  'actions.resumeJob': fn('Resumes an interrupted or failed AI job', [TID, p('jobId', 'string')], 'ActionResult'),
  'actions.cancelJob': fn('Dismisses an interrupted or failed AI job', [TID, p('jobId', 'string')], 'ActionResult'),
};

/** Notes that apply to a whole family of calls, shown with each call */
const FAMILY_NOTES = {
  actions: 'Same as pressing the button: approval gates, AI budgets, workflow-step checks and blocked tickets still apply. Each adds a "(plugin X)" line to the ticket activity log.',
};

/** The permission of a call, from CALLS: { permission, level } plus the manifest line that grants it */
function permissionOf(call) {
  const [permission, level] = CALLS[call];
  const levels = LEVEL_PERMISSIONS[permission];
  let grant;
  if (level === true) grant = `"${permission}": true`;
  else if (ITEM_PERMISSIONS[permission]) grant = `"${permission}": true or a list containing "${level}"`;
  else grant = `"${permission}": "${level}"${levels && levels.indexOf(level) < levels.length - 1 ? ` (or higher: ${levels.slice(levels.indexOf(level) + 1).map((l) => `"${l}"`).join(', ')})` : ''}`;
  return { permission, level, grant, changesData: level !== 'read' };
}

const calls = {};
for (const [name, doc] of Object.entries(callDocs)) {
  const namespace = name.split('.')[0];
  calls[name] = { name, namespace, ...doc, ...(CALLS[name] ? permissionOf(name) : {}), ...(FAMILY_NOTES[namespace] ? { notes: [doc.notes, FAMILY_NOTES[namespace]].filter(Boolean).join(' ') } : {}) };
}

// ---- events ---------------------------------------------------------------------------------------------------------------------------

/** The data every ticket.* event about a ticket carries (what a webhook gets of a ticket; never its settings) */
const TICKET_EVENT_FIELDS = {
  id: 'string', number: 'number', title: 'string', type: 'string', status: 'string', developer: 'string | null', branch: 'string | null', parentBranch: 'string | null',
  pullRequest: '{ number: number; url: string | null; status: string | null } | null', ciState: 'string | null', needsAttention: 'string | null', updatedAt: 'string (ISO date)',
};
types.TicketEventData = { description: 'The state of a ticket in an event', fields: TICKET_EVENT_FIELDS };
types.ProjectEventData = { description: 'A project in an event (no settings)', fields: { id: 'string', name: 'string', description: 'string', active: 'boolean', customFields: 'CustomValues' } };
types.CustomFieldEventData = { description: 'A custom field definition in an event', fields: { id: 'string', code: 'string', name: 'string', entityType: 'string', fieldType: 'string', options: 'string[] | null' } };

/** The shape of every event delivered to onEvent(event, ctx) and to `actions` (`{{event.data.x}}`, `{{event.ticket.title}}`) */
const envelope = {
  description: 'Delivered to onEvent and used by declarative actions. A plugin never receives the events its own calls caused (actor says which plugin did, otherwise null)',
  fields: {
    event: 'string (the event name)', type: 'string (same as event)', deliveryId: 'string (uuid)', timestamp: 'string (ISO date)',
    project: '{ id: string; name?: string; customFields: CustomValues } | null', ticket: '{ id: string; number?: number; title?: string; customFields?: CustomValues } | null',
    data: 'the event data (see events)', actor: "{ type: 'plugin'; id: string } | null",
  },
};

const ev = (summary, when, data, extra = {}) => ({ summary, when, data, ...extra });

const eventDocs = {
  'ticket.status_changed': ev('A ticket moved to another step', 'After the move', '{ from: string; to: string }'),
  'pr.opened': ev('A pull request was opened for a ticket', 'After Volath opens it', '{ number: number; url: string; title: string; draft: boolean; branch: string | null; base: string | null }'),
  'test.finished': ev('A live test finished', 'When the run ends', "{ result: string; environment: string; url: string | null; passed: number; total: number; failed: Array<{ step: string; error: string | null }> }"),
  'ci.failed': ev('CI failed on a ticket\'s pull request', 'When Volath sees the failed checks', '{ checks: string[]; commit: string | null; pullRequestUrl: string | null; fixRound: number }'),
  'deploy.finished': ev('A ticket was deployed to staging', 'After the deploy', "{ environment: 'staging'; branch: string; deployBranch: string | null; deployedAt: string }"),
  'budget.exceeded': ev('A ticket hit its AI budget', 'When the run is stopped', '{ reason: string }'),
  'approval.requested': ev('A ticket waits for a person to approve', 'When the gate is reached', "{ gate: 'development' | 'pull-request' | 'merge' | 'parent-merge' | 'workflow'; reason: string }"),
  'digest': ev('The periodic digest of a project', 'When the digest is sent', '{ project: { id: string; name: string } | null; merged: unknown[]; stuck: unknown[]; waitingApproval: unknown[]; failedCi: unknown[]; reviewRequests: unknown[]; aiSpend: { total: number; previous: number; runs: number; failedRuns: number; topTickets: unknown[] } & Record<string, unknown> } & Record<string, unknown>', { notes: 'The digest report; log it once to see every field.' }),
  'ticket.updated': ev('A ticket changed (status, pull request, CI...)', 'After the change', 'TicketEventData'),
  'ticket.deleted': ev('A ticket was deleted', 'After the delete', '{ id: string }'),
  'ticket.timeline': ev('A line was added to a ticket\'s timeline', 'After it is saved', '{ action: string; commitHash: string | null; timestamp: string }'),
  'ticket.activity': ev('A line was added to a ticket\'s activity log', 'After it is saved', '{ category: string; headline: string; message: string; timestamp: string }'),
  'ai.job': ev('An AI job (analysis or development) changed', 'On every change of the job', "{ id: string; ticketId: string; kind: 'analysis' | 'development'; status: 'running' | 'done' | 'failed' | 'interrupted' | 'resumed' | 'cancelled'; options: Record<string, unknown> | null; resumeCount: number; error: string | null; createdAt: string; updatedAt: string }"),
  'notification': ev('A notification was added to the bell', 'After it is saved', "{ title: string; message: string; level: 'info' | 'success' | 'warning' | 'error'; needsAttention: boolean }"),
  'ticket.reverted': ev('A merged ticket was reverted', 'After the revert pull request', '{ number: number; url: string; base: string; reason: string | null }'),
  'release.published': ev('A release was published', 'After it is published (no ticket)', '{ version: string; title: string; notes: string; url: string | null }'),
  'workflow.notify': ev('A Notify step of a workflow ran', 'When a ticket enters the step', '{ step: string; message: string; ticket: { id: string; number: number; title: string } }'),
  'ticket.created': ev('A ticket was created', 'After it is saved', 'TicketEventData & { description: string; parentTicketId: string | null }', { notes: 'event.ticket.customFields has the custom fields it was created with.' }),
  'ticket.comment_added': ev('A comment was added to a ticket', 'After it is saved', '{ id: string; author: string; content: string (cut to 2000 characters) }'),
  'project.created': ev('A project was created', 'After it is saved', 'ProjectEventData'),
  'project.updated': ev('A project was changed', 'After it is saved', 'ProjectEventData'),
  'project.deleted': ev('A project was deleted', 'After the delete', '{ id: string; name: string }'),
  'developer.created': ev('A developer was added to a project', 'After it is saved', 'Developer'),
  'developer.updated': ev('A developer was changed', 'After it is saved', 'Developer'),
  'customfield.created': ev('A custom field was defined', 'After it is saved', 'CustomFieldEventData'),
  'customfield.updated': ev('A custom field was changed', 'After it is saved', 'CustomFieldEventData'),
  'customfield.deleted': ev('A custom field was deleted', 'After the delete', 'CustomFieldEventData'),
  'workflow.updated': ev('A workflow was saved or reset', 'After tickets followed the change', '{ projectId: string | null; name: string; steps: string[]; reset: boolean }'),
};

const events = {};
for (const [name, doc] of Object.entries(eventDocs)) events[name] = { name, ...doc };

/** entity.<table>.created|updated|deleted: any row written to the database */
const entityEvents = {
  pattern: 'entity.<table>.created | entity.<table>.updated | entity.<table>.deleted',
  regex: '^entity\\.[a-z_]+\\.(created|updated|deleted)$',
  summary: 'Every row written to the database is an event, named after its table (entity.users.updated, entity.agents.created, entity.project_members.created...). The named events above stay and carry richer data',
  data: '{ table: string; id: string | null; row: Record<string, unknown>; changed?: string[] (updated only: the columns that changed) }',
  notes: [
    'row has every column except those that look like secrets (names matching pass, secret, token, hash, salt, credential, api key, private, email); text over 5000 characters is cut.',
    'Left out because they are bookkeeping: activity_logs, notifications, ai_jobs, ai_costs, package_usage, runtime_state, user_sessions, api_tokens, app_settings, assistant_*, self_improve_*, live_test_runs, timelines.',
    'event.project / event.ticket are filled when the row has a projectId / ticketId (or is a project / ticket).',
    'Developers are rows of project_members; people are rows of users. Webhooks created in Settings › Webhooks never receive these unless they list them by name.',
  ],
  tables: ['users', 'roles', 'project_members', 'projects', 'tickets', 'ticket_comments', 'custom_fields', 'workflows', 'workflow_catalog', 'agents', 'skills', 'squads', 'project_documents', 'document_folders', 'ticket_documents', 'ticket_templates', 'board_views', 'milestones', 'webhooks', 'project_memories', 'project_plans', 'validation_criteria', 'code_health_issues', 'design_extractions'],
};

// ---- manifest (plugin.json) ---------------------------------------------------------------------------------------------------------

const levelSchema = (name) => ({ enum: LEVEL_PERMISSIONS[name], description: `"${LEVEL_PERMISSIONS[name].join('" < "')}": each level includes the ones before it` });
const itemSchema = (name, what) => ({ oneOf: [{ const: true }, { type: 'array', items: { enum: ITEM_PERMISSIONS[name] }, uniqueItems: true }], description: what });

const LEVEL_DESCRIPTIONS = {
  tickets: 'Read tickets (read) or also create, change, move and comment (write)',
  projects: 'read; write creates/edits projects; admin also sets the folder (where Volath runs git and the AI) and the settings of a project',
  developers: 'Read project members, or also add, change and remove them',
  users: 'read the people; write edits profiles (never email or password); admin also changes roles and project access',
  agents: 'Read or create/edit AI agents (never deleted)',
  skills: 'Read or create/edit skills',
  squads: 'Read or create/edit squads',
  documents: 'Read documents, or add notes/links, edit and attach them',
  ticketTemplates: 'Read or create/edit ticket templates',
  boardViews: 'Read or create/edit shared board views',
  customFields: 'Read or create/rename custom field definitions',
  workflows: 'Read workflows and the catalog, or replace the workflow of any project and publish to the catalog',
  webhooks: 'Read the webhooks of a project, or create and manage webhooks this plugin made',
};

const permissionProperties = {
  network: { type: 'array', items: { type: 'string', pattern: '^(\\*\\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\\d{1,5})?$' }, description: 'Hosts ctx.http.fetch and http actions may call ("api.acme.com", "*.acme.com", "localhost:3000"). No scheme, no path; redirects are not followed' },
  events: { type: 'array', items: { anyOf: [{ enum: [...EVENTS, '*'] }, { type: 'string', pattern: entityEvents.regex }] }, description: 'Events the plugin receives ("*" = all)' },
  storage: { type: 'boolean', description: 'ctx.storage (JSON values, no size limit)' },
  notifications: { type: 'boolean', description: 'ctx.notifications.create' },
  ...Object.fromEntries(Object.keys(LEVEL_PERMISSIONS).map((k) => [k, { ...levelSchema(k), description: LEVEL_DESCRIPTIONS[k] }])),
  actions: itemSchema('actions', 'true (all) or the actions ctx.actions may start'),
  prompts: itemSchema('prompts', 'true (all) or the AI runs the plugin may append text to'),
};

const slotSchema = {
  type: 'object',
  required: ['slot', 'title'],
  additionalProperties: false,
  properties: {
    slot: { enum: SLOTS, description: 'topbar: button opening a panel; menu: Plugins menu item opening a page (needs entry); board: widget row above the board; ticket.tab: collapsible section in the ticket; ticket.panel: block in the ticket side column; project.tab: block in the project settings' },
    title: { type: 'string', minLength: 1, maxLength: 60 },
    icon: { type: 'string', description: 'Name of a Lucide icon' },
    height: { type: 'integer', minimum: 40, maximum: 1200, description: 'Pixels' },
    entry: { type: 'string', pattern: '\\.html?$', description: 'An html page inside the zip, in a sandboxed frame (volath.api only, no network)' },
    text: { type: 'string', maxLength: 1000, description: 'Plain text shown in the slot' },
    links: { type: 'array', maxItems: 8, items: { type: 'object', required: ['label', 'url'], properties: { label: { type: 'string' }, url: { type: 'string', pattern: '^https?://' } } }, description: 'Up to 8 links' },
  },
  description: 'Exactly one of entry, text or links',
};

const manifest = {
  apiVersion: API_VERSION,
  description: 'plugin.json at the top of the zip. validateManifest() in manifest.js is the authority; this is the same rules as JSON Schema',
  schema: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Volath plugin manifest (plugin.json)',
    type: 'object',
    required: ['id', 'name', 'version', 'apiVersion'],
    additionalProperties: true,
    properties: {
      id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{1,39}$', description: '2-40 characters: lowercase letters, digits, dashes. Never change it: it identifies the plugin and its stored data' },
      name: { type: 'string', minLength: 1, maxLength: 60 },
      version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$', description: 'Semantic version; installing the same id updates the plugin and keeps its settings' },
      apiVersion: { const: API_VERSION, description: `Always ${API_VERSION}` },
      description: { type: 'string', maxLength: 500 },
      author: { type: 'string', maxLength: 500 },
      homepage: { type: 'string', maxLength: 500 },
      logo: { type: 'string', pattern: '\.(png|jpe?g|webp|svg)$', description: 'The plugin logo: a relative path to a .png, .jpg, .webp or .svg inside the zip (up to 512 KB, square works best, e.g. 256x256). Shown in Settings > Plugins and in the marketplace' },
      volath: { type: 'string', maxLength: 500, description: 'Semver range of compatible Volath versions' },
      main: { type: 'string', pattern: '\\.c?js$', description: 'The code (CommonJS): a relative .js path inside the zip. Needed for schedule, webhooks, onEvent, onPrompt, onRequest' },
      permissions: { type: 'object', additionalProperties: false, properties: permissionProperties, description: 'Everything the plugin may do; the administrator approves it, and approves again when it changes' },
      settings: {
        type: 'array',
        description: 'Fields the administrator fills in (general, and per project: a project without a value uses the general one). Read as ctx.settings.<key> or {{settings.<key>}}',
        items: {
          type: 'object',
          required: ['key', 'label', 'type'],
          properties: {
            key: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_]{0,39}$' },
            label: { type: 'string' },
            type: { enum: SETTING_TYPES, description: 'password values are encrypted and never shown again' },
            help: { type: 'string' },
            placeholder: { type: 'string' },
            fallback: { type: ['string', 'number', 'boolean'], description: 'Default' },
            required: { type: 'boolean', description: 'Blocks enabling the plugin until filled, and cannot be emptied while the plugin is on (unless it has a fallback). Secrets: when saving, an empty text or the mask keeps the stored secret and null removes it' },
            pattern: { type: 'string', maxLength: 300, description: 'text and password: a regular expression the value must match (checked when the administrator saves, with a message naming the field)' },
            minLength: { type: 'integer', minimum: 0, maximum: 2000, description: 'text and password' },
            maxLength: { type: 'integer', minimum: 0, maximum: 2000, description: 'text and password' },
            min: { type: 'number', description: 'number only' },
            max: { type: 'number', description: 'number only' },
            options: { type: 'array', items: { type: 'object', required: ['value', 'label'], properties: { value: { type: 'string' }, label: { type: 'string' } } }, description: 'select only' },
          },
        },
      },
      ui: {
        type: 'object',
        description: 'A page of the plugin and/or items in Volath\'s screens. entry and title are required unless slots are given',
        properties: {
          entry: { type: 'string', pattern: '\\.html?$', description: 'ONE self-contained html file; talks to onRequest through volath.api()' },
          title: { type: 'string' },
          icon: { type: 'string', description: 'Name of a Lucide icon' },
          slots: { type: 'array', maxItems: 20, items: slotSchema },
        },
      },
      actions: {
        type: 'array',
        description: 'Declarative reactions (no code): when an event happens, call an API (http) or ask Volath to do something (call). {{event.*}}, {{settings.*}}, {{plugin.id}} work in the values',
        items: {
          type: 'object',
          required: ['on'],
          properties: {
            on: { anyOf: [{ enum: EVENTS }, { type: 'string', pattern: entityEvents.regex }], description: 'The event; it must also be in permissions.events' },
            when: { type: 'object', description: 'path -> value (text, number, boolean) that must all match; paths are relative to the event (data.to, ticket.number)' },
            http: {
              type: 'object',
              required: ['method', 'url'],
              properties: {
                method: { enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
                url: { type: 'string', description: 'https://... or starting with {{settings.x}}; its host must be in permissions.network' },
                headers: { type: 'object', additionalProperties: { type: 'string' } },
                body: { description: 'Sent as JSON when an object' },
              },
            },
            call: { enum: Object.keys(CALLS), description: 'Instead of http: one of the ctx functions (e.g. "developers.add"), allowed by permissions' },
            args: { description: 'An object or a list of arguments for call; placeholders work in the values' },
          },
          description: 'Give either http or call',
        },
      },
      schedule: {
        type: 'array',
        description: 'Runs module.exports.tasks[task]; needs main',
        items: { type: 'object', required: ['every', 'task'], properties: { every: { type: 'string', pattern: '^\\d{1,4}(m|h|d)$', description: 'Minutes, hours or days; at least 1m' }, task: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_]{0,39}$' } } },
      },
      webhooks: {
        type: 'array',
        description: 'Addresses outside systems may call (needs main): POST <volath>/api/plugin-hooks/<id>/<name>?token=<secret> (or header X-Volath-Token). Volath makes the secret; the administrator copies it in Settings › Plugins',
        items: { type: 'object', required: ['name'], properties: { name: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,39}$' }, description: { type: 'string', maxLength: 300 } } },
      },
      promptAppend: {
        type: 'array',
        description: 'Text added at the END of the AI prompt at a stage, never replacing it, inside a "--- Added by plugin <name> ---" block. The stage must be in permissions.prompts',
        items: { type: 'object', required: ['on', 'text'], properties: { on: { enum: ITEM_PERMISSIONS.prompts }, text: { type: 'string', minLength: 1 } } },
      },
    },
  },
  rules: [
    'A plugin must have at least one of: main, ui, actions, promptAppend.',
    'Every action.on must be listed in permissions.events (or "*"); an action.call must be allowed by permissions; an http action host must be in permissions.network.',
    'schedule and webhooks need main.',
    'Unknown top-level fields are ignored with a warning.',
  ],
};

// ---- hooks (what the plugin code exports) ------------------------------------------------------------------------------------------

const hooks = {
  description: 'module.exports of the file named by `main` (CommonJS). Runs in its own Node process without file system access; each call has 60 seconds. Return JSON-serializable values',
  onLoad: { signature: '(ctx) => void | Promise<void>', when: 'After the process starts, and again after the settings are saved', returns: 'ignored' },
  onEvent: { signature: '(event: EventEnvelope, ctx) => void | Promise<void>', when: 'For each event listed in permissions.events', returns: 'ignored' },
  onRequest: {
    signature: '(req, ctx) => { status?: number; json?: unknown; text?: string } | unknown',
    when: 'The plugin\'s page or slot calls volath.api(path, init)',
    request: '{ method: string; path: string (starts with /); query: Record<string, unknown>; headers: Record<string, string>; body: unknown; user: { id: string; name: string; permissions: string[] } | null }',
    returns: '{ status, json } or { status, text }; anything else is sent as JSON with status 200',
  },
  onWebhook: {
    signature: '(req, ctx) => { status?: number; json?: unknown; text?: string } | void',
    when: 'An outside system calls /api/plugin-hooks/<id>/<name> with the right secret (wrong secret, unknown name or disabled plugin: 403; over 600 calls a minute: 429)',
    request: '{ name: string; method: string; query: Record<string, unknown> (without the token); headers: Record<string, string>; rawBody: string (for checking signatures); body: unknown (parsed JSON or form) }',
    returns: '{ status, json } or { status, text }; nothing answers 200 { ok: true }',
  },
  onPrompt: {
    signature: '({ stage, ticketId }, ctx) => string | { text: string } | void',
    when: 'Before an AI run whose stage is in permissions.prompts; the text is APPENDED at the end of the prompt in a marked block (resumed sessions get nothing)',
    stages: ITEM_PERMISSIONS.prompts,
    returns: 'The text to add, or nothing. 15 seconds; an error or timeout adds nothing and never stops the run. ctx.projectId is the ticket\'s project, so ctx.settings are that project\'s values',
  },
  tasks: { signature: '{ [name: string]: (ctx) => void | Promise<void> }', when: 'Every `schedule[].every` for the entry whose `task` is that name' },
  page: {
    description: 'Inside ui.entry and slot pages (sandboxed frame; no network, no external scripts; inline everything)',
    api: 'volath.api(path: string, init?: { method?: string; body?: unknown }) => Promise<{ status: number; ok: boolean; json: unknown; text: string }>  (answered by onRequest)',
    theme: 'The host forces the page background and text colour to the current dark or light theme. Read volath.theme ("dark" | "light"), listen for the "volath-theme" event on window, and style with the CSS variables --volath-background, -foreground, -card, -card-foreground, -border, -muted, -muted-foreground, -primary, -primary-foreground, -destructive, -accent, -radius and -font. Never hard-code white or black',
    context: 'volath.context = { slot?: string; projectId?: string | null; ticketId?: string | null }  (ids only; set for slot pages)',
  },
};

// ---- ctx (besides the calls) ---------------------------------------------------------------------------------------------------------

const ctx = {
  description: 'The object every hook receives. Namespaces for CALLS (ctx.tickets, ctx.projects...) exist for every entry of `calls`; these are the rest',
  members: {
    plugin: { type: '{ id: string; version: string }', description: 'This plugin' },
    settings: { type: 'Record<string, string | number | boolean>', description: 'Values of the manifest settings: manifest defaults, then the general value, then the value of the current project; passwords decrypted' },
    projectId: { type: 'string | null', description: 'The project of the current event / ticket, otherwise null' },
    log: { type: '((...args: unknown[]) => void) & { info; warn; error }', description: 'Writes to the plugin log in Settings › Plugins' },
    'http.fetch': {
      type: "(url: string, init?: { method?: string; headers?: Record<string, string>; body?: unknown }) => Promise<HttpResponse>",
      description: 'The only way out to the network. The host must be in permissions.network; redirects are not followed; an object body is sent as JSON. No response size limit; 55 seconds',
    },
    'storage.get': { type: '(key: string) => Promise<unknown>', description: 'Needs permissions.storage. null when absent' },
    'storage.set': { type: '(key: string, value: unknown) => Promise<void>', description: 'Needs permissions.storage. JSON value, no size limit' },
    'storage.delete': { type: '(key: string) => Promise<void>', description: 'Needs permissions.storage' },
  },
};

// ---- limits ---------------------------------------------------------------------------------------------------------------------------------

const limits = {
  callTimeoutMs: 60000,
  startTimeoutMs: 10000,
  fetchTimeoutMs: 55000,
  promptHookTimeoutMs: 15000,
  writesPerMinute: 120,
  webhookCallsPerMinute: 600,
  crashesBeforeSwitchedOff: { count: 5, withinMinutes: 10 },
  scheduleMinimum: '1m',
  storage: 'no limit', httpResponse: 'no limit',
  slotsPerPlugin: 20,
  notes: 'A "write" call is any CALLS entry whose level is not "read". The plugin sandbox needs Node 22+ (--permission) unless VOLATH_PLUGIN_SANDBOX=off.',
};

module.exports = { types, calls, events, entityEvents, envelope, manifest, hooks, ctx, limits };
