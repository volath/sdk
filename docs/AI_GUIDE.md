# Writing a Volath plugin (guide for an AI assistant)

You are asked to write a **plugin for Volath**. Volath is a project and ticket management app whose tickets are developed by AI. This document is everything you need: the rules, the complete reference of what a plugin can do, and working examples. Do not invent functions, events, permissions or manifest fields: if it is not in this document, it does not exist.

## What a plugin is

A plugin is a **zip** with a `plugin.json` at its root and, optionally, a CommonJS Node file (`main`) and a web page (`ui`). The administrator installs it in **Settings › Plugins**, reads what it asks for in plain words, and accepts. Until then it stays off. If a later version asks for more, it is switched off again until accepted.

A plugin can be **declarative** (no code: `actions` that call an HTTP API or a Volath function when an event happens) or **code** (a `main` file that exports hooks and uses `ctx`). Prefer declarative when it is enough: it is simpler, safer and easier to approve.

## What a plugin can do

- **React** to anything that happens in Volath (a named event, or `entity.<table>.created|updated|deleted` for every row written), or to the clock (`schedule`), or to an outside system (`webhooks`, with a secret address), or to a click on its own page or widget (`onRequest`).
- **Act** on Volath through `ctx`: tickets, projects (and with `admin` the folder and settings), workflows and the workflow catalog, developers, users (never email or password), custom fields, agents, skills, squads, documents, ticket templates, board views, webhooks, notifications, and direct actions (analyze, develop, pull request, tests, merge, approve).
- **Talk to the outside** with `ctx.http.fetch` to hosts listed in `permissions.network`; keep data in `ctx.storage`.
- **Extend the AI prompts** by appending text (never replacing) at certain stages.
- **Add UI**: a page, and widgets in the top bar, the menu, the board, ticket and project tabs (`ui.slots`), all shown with a "from plugin X" badge.
- Everything a plugin creates in Volath is marked "from plugin X" for the people who use it.

## Rules

1. **Least permission.** Ask only for what the code uses; name each one in the README. The permission levels are `read` < `write` < `admin`; a higher one includes the lower ones. `*` for events only when needed.
2. **No secrets in code.** Put tokens and URLs in `settings` (`type: "password"` for secrets). Settings can be general and per project; `ctx.settings` already gives the value for the current project.
3. **Handle failure.** A call can be refused (missing permission) or fail; wrap them, log with `ctx.log`, never throw out of a hook for something expected.
4. **Do not loop.** A plugin never receives events its own calls caused, but two plugins can still trigger each other. There is a limit of 120 changes per minute per plugin.
5. **Be idempotent.** The same event can be delivered again after a restart: use `ctx.storage` or a lookup to avoid doing the work twice.
6. **Return JSON-serializable values.** Each call has 60 seconds. There is no limit on stored data or HTTP responses.
7. **No file system, no child processes, no `require` of Node built-ins that reach outside.** The code runs in a sandbox. Use `ctx.http.fetch` for the network.
8. **One file is enough.** Do not use a build step; the zip holds exactly the source that runs.
9. Write the `plugin.json` first, then the code. The id is lowercase letters, digits and dashes and is also the folder name.
10. **Paid features stay paid.** Calls that do what a licensed Volath feature does (`ctx.tickets` and `ctx.actions` need the board, `ctx.agents`, `ctx.skills`, `ctx.squads`, `ctx.documents` and `ctx.webhooks` need their own module) are refused with "Your plan does not include this feature" unless the person's plan has it, checked on every call. Do not write a plugin that reimplements a licensed feature (analytics, memory, planner, self-improve, design-to-code, reviews, releases, integrations such as New Relic or SonarCloud...) from raw data: it is not accepted in the marketplace, and Volath's terms do not allow installing one. If the person asks for it, say so and point them to the plan instead.

## Settings fields in plugin.json

`settings` is a list of fields the administrator fills in (in Settings > Plugins, generally and per project; a project without a value uses the general one). The plugin reads them as `ctx.settings.<key>`.

| Field | Meaning |
| --- | --- |
| `key`, `label`, `type` | `type` is `text`, `password`, `number`, `toggle` or `select` (a select also has `options: [{ value, label }]`) |
| `help`, `placeholder`, `fallback` | Hint texts and the default value |
| `required` | Enabling the plugin is blocked until it is filled, and it cannot be emptied while the plugin is on (unless it has a `fallback`) |
| `pattern` | text and password: a regular expression the value must match, e.g. `"^https://"` (at most 300 characters) |
| `minLength`, `maxLength` | text and password: 0 to 2000 characters |
| `min`, `max` | number only |

Values are checked when the administrator saves; every problem is shown next to its field, and nothing is saved while one is wrong. Use these checks instead of validating in `onLoad`. A `password` is stored encrypted, shown only as "set", and never exported with the settings; the plugin gets it decrypted in `ctx.settings`.

## Pages and widgets follow the app's theme

Pages and slot widgets run in a sandboxed frame. Volath injects the app's current dark or light colours and forces the page background and text colour, so a widget is never a white block in a dark app. Style with the variables `--volath-background`, `--volath-foreground`, `--volath-card`, `--volath-border`, `--volath-muted`, `--volath-muted-foreground`, `--volath-primary`, `--volath-destructive`, `--volath-radius` and `--volath-font`. `volath.theme` is `"dark"` or `"light"`, and a `volath-theme` event fires on `window` when the person switches. Never hard-code white or black.

## Distribution: zip or marketplace

A plugin reaches an installation in one of two ways, and Volath shows which one next to the plugin in Settings > Plugins:

- **Marketplace** ("From the marketplace"): the official plugins in the volath/marketplace repository, one folder each, browsable in Settings > Plugins > Marketplace. Volath checks the sha256 of the download against the registry and refuses a mismatch. A plugin in the marketplace is reviewed; to propose one, open a pull request there with the plugin folder (the same files `pack` zips).
- **Zip** ("Installed from a zip"): any zip the administrator uploads. It is not reviewed by Volath. An administrator can switch on the policy "Only allow marketplace plugins", which makes Volath refuse zip installs.

Either way the plugin stays **off until the administrator approves its permissions**. On install Volath may show warnings (the plugin looks like a paid feature, or a zip plugin asks for admin level or wide network access); they do not block, they inform. Updating shows the permissions that changed, keeps the previous version so it can be rolled back with its settings, and automatic updates only apply when the new version asks for no extra permission. So: keep permissions stable between versions, bump `version` on every change, and describe in the README why each permission is needed.

## Health and logs

Volath shows each running plugin's restarts, last crashes, call counts and timings, memory and uptime, and keeps its `ctx.log` output (searchable and downloadable by the administrator). Log what an administrator would need to diagnose a problem; never log secrets or personal data.

## Workflow for the human

```
npx @volath/sdk new my-plugin     # scaffold (or copy an example)
npx @volath/sdk validate .        # checks plugin.json and the files it points to
npx @volath/sdk test .            # starts the plugin like Volath does and sends it sample events (requests are only printed; --live really calls out)
npx @volath/sdk pack .            # writes my-plugin.zip to install in Settings › Plugins
```

When you answer, give: the `plugin.json`, every code or page file in full, a short README (what it does and why each permission), and the commands above for the person to run. In code files, add `/** @type {import("@volath/sdk").PluginModule} */` before `module.exports` for editor help.

---

## Limits

- **callTimeoutMs**: 60000
- **startTimeoutMs**: 10000
- **fetchTimeoutMs**: 55000
- **promptHookTimeoutMs**: 15000
- **writesPerMinute**: 120
- **webhookCallsPerMinute**: 600
- **crashesBeforeSwitchedOff**: {"count":5,"withinMinutes":10}
- **scheduleMinimum**: 1m
- **storage**: no limit
- **httpResponse**: no limit
- **slotsPerPlugin**: 20
- **notes**: A "write" call is any CALLS entry whose level is not "read". The plugin sandbox needs Node 22+ (--permission) unless VOLATH_PLUGIN_SANDBOX=off.

## Permissions

A plugin asks for what it needs in `permissions` of `plugin.json`; the administrator sees each line in plain words and must accept them. A permission with levels includes the lower ones (`read` < `write` < `admin`).

| Permission | Meaning |
|---|---|
| `network` | /H/o/s/t/s/ /c/t/x/./h/t/t/p/./f/e/t/c/h/ /a/n/d/ /h/t/t/p/ /a/c/t/i/o/n/s/ /m/a/y/ /c/a/l/l/ /(/"/a/p/i/./a/c/m/e/./c/o/m/"/,/ /"/*/./a/c/m/e/./c/o/m/"/,/ /"/l/o/c/a/l/h/o/s/t/:/3/0/0/0/"/)/./ /N/o/ /s/c/h/e/m/e/,/ /n/o/ /p/a/t/h/;/ /r/e/d/i/r/e/c/t/s/ /a/r/e/ /n/o/t/ /f/o/l/l/o/w/e/d/ |
| `events` | /E/v/e/n/t/s/ /t/h/e/ /p/l/u/g/i/n/ /r/e/c/e/i/v/e/s/ /(/"/*/"/ /=/ /a/l/l/)/ |
| `storage` | /c/t/x/./s/t/o/r/a/g/e/ /(/J/S/O/N/ /v/a/l/u/e/s/,/ /n/o/ /s/i/z/e/ /l/i/m/i/t/)/ |
| `notifications` | /c/t/x/./n/o/t/i/f/i/c/a/t/i/o/n/s/./c/r/e/a/t/e/ |
| `tickets` | /R/e/a/d/ /t/i/c/k/e/t/s/ /(/r/e/a/d/)/ /o/r/ /a/l/s/o/ /c/r/e/a/t/e/,/ /c/h/a/n/g/e/,/ /m/o/v/e/ /a/n/d/ /c/o/m/m/e/n/t/ /(/w/r/i/t/e/)/ |
| `projects` | /r/e/a/d/;/ /w/r/i/t/e/ /c/r/e/a/t/e/s///e/d/i/t/s/ /p/r/o/j/e/c/t/s/;/ /a/d/m/i/n/ /a/l/s/o/ /s/e/t/s/ /t/h/e/ /f/o/l/d/e/r/ /(/w/h/e/r/e/ /V/o/l/a/t/h/ /r/u/n/s/ /g/i/t/ /a/n/d/ /t/h/e/ /A/I/)/ /a/n/d/ /t/h/e/ /s/e/t/t/i/n/g/s/ /o/f/ /a/ /p/r/o/j/e/c/t/ |
| `developers` | /R/e/a/d/ /p/r/o/j/e/c/t/ /m/e/m/b/e/r/s/,/ /o/r/ /a/l/s/o/ /a/d/d/,/ /c/h/a/n/g/e/ /a/n/d/ /r/e/m/o/v/e/ /t/h/e/m/ |
| `users` | /r/e/a/d/ /t/h/e/ /p/e/o/p/l/e/;/ /w/r/i/t/e/ /e/d/i/t/s/ /p/r/o/f/i/l/e/s/ /(/n/e/v/e/r/ /e/m/a/i/l/ /o/r/ /p/a/s/s/w/o/r/d/)/;/ /a/d/m/i/n/ /a/l/s/o/ /c/h/a/n/g/e/s/ /r/o/l/e/s/ /a/n/d/ /p/r/o/j/e/c/t/ /a/c/c/e/s/s/ |
| `agents` | /R/e/a/d/ /o/r/ /c/r/e/a/t/e///e/d/i/t/ /A/I/ /a/g/e/n/t/s/ /(/n/e/v/e/r/ /d/e/l/e/t/e/d/)/ |
| `skills` | /R/e/a/d/ /o/r/ /c/r/e/a/t/e///e/d/i/t/ /s/k/i/l/l/s/ |
| `squads` | /R/e/a/d/ /o/r/ /c/r/e/a/t/e///e/d/i/t/ /s/q/u/a/d/s/ |
| `documents` | /R/e/a/d/ /d/o/c/u/m/e/n/t/s/,/ /o/r/ /a/d/d/ /n/o/t/e/s///l/i/n/k/s/,/ /e/d/i/t/ /a/n/d/ /a/t/t/a/c/h/ /t/h/e/m/ |
| `ticketTemplates` | /R/e/a/d/ /o/r/ /c/r/e/a/t/e///e/d/i/t/ /t/i/c/k/e/t/ /t/e/m/p/l/a/t/e/s/ |
| `boardViews` | /R/e/a/d/ /o/r/ /c/r/e/a/t/e///e/d/i/t/ /s/h/a/r/e/d/ /b/o/a/r/d/ /v/i/e/w/s/ |
| `customFields` | /R/e/a/d/ /o/r/ /c/r/e/a/t/e///r/e/n/a/m/e/ /c/u/s/t/o/m/ /f/i/e/l/d/ /d/e/f/i/n/i/t/i/o/n/s/ |
| `workflows` | /R/e/a/d/ /w/o/r/k/f/l/o/w/s/ /a/n/d/ /t/h/e/ /c/a/t/a/l/o/g/,/ /o/r/ /r/e/p/l/a/c/e/ /t/h/e/ /w/o/r/k/f/l/o/w/ /o/f/ /a/n/y/ /p/r/o/j/e/c/t/ /a/n/d/ /p/u/b/l/i/s/h/ /t/o/ /t/h/e/ /c/a/t/a/l/o/g/ |
| `webhooks` | /R/e/a/d/ /t/h/e/ /w/e/b/h/o/o/k/s/ /o/f/ /a/ /p/r/o/j/e/c/t/,/ /o/r/ /c/r/e/a/t/e/ /a/n/d/ /m/a/n/a/g/e/ /w/e/b/h/o/o/k/s/ /t/h/i/s/ /p/l/u/g/i/n/ /m/a/d/e/ |
| `actions` | /t/r/u/e/ /(/a/l/l/)/ /o/r/ /t/h/e/ /a/c/t/i/o/n/s/ /c/t/x/./a/c/t/i/o/n/s/ /m/a/y/ /s/t/a/r/t/ |
| `prompts` | /t/r/u/e/ /(/a/l/l/)/ /o/r/ /t/h/e/ /A/I/ /r/u/n/s/ /t/h/e/ /p/l/u/g/i/n/ /m/a/y/ /a/p/p/e/n/d/ /t/e/x/t/ /t/o/ |

## plugin.json

- A plugin must have at least one of: main, ui, actions, promptAppend.
- Every action.on must be listed in permissions.events (or "*"); an action.call must be allowed by permissions; an http action host must be in permissions.network.
- schedule and webhooks need main.
- Unknown top-level fields are ignored with a warning.

The JSON Schema is in `schema/plugin.schema.json`. Fields:

- `id` (required): 2-40 characters: lowercase letters, digits, dashes. Never change it: it identifies the plugin and its stored data
- `name` (required): 
- `version` (required): Semantic version; installing the same id updates the plugin and keeps its settings
- `apiVersion` (required): Always 1
- `description`: 
- `author`: 
- `homepage`: 
- `volath`: Semver range of compatible Volath versions
- `main`: The code (CommonJS): a relative .js path inside the zip. Needed for schedule, webhooks, onEvent, onPrompt, onRequest
- `permissions`: Everything the plugin may do; the administrator approves it, and approves again when it changes
- `settings`: Fields the administrator fills in (general, and per project: a project without a value uses the general one). Read as ctx.settings.<key> or {{settings.<key>}}
- `ui`: A page of the plugin and/or items in Volath's screens. entry and title are required unless slots are given
- `actions`: Declarative reactions (no code): when an event happens, call an API (http) or ask Volath to do something (call). {{event.*}}, {{settings.*}}, {{plugin.id}} work in the values
- `schedule`: Runs module.exports.tasks[task]; needs main
- `webhooks`: Addresses outside systems may call (needs main): POST <volath>/api/plugin-hooks/<id>/<name>?token=<secret> (or header X-Volath-Token). Volath makes the secret; the administrator copies it in Settings › Plugins
- `promptAppend`: Text added at the END of the AI prompt at a stage, never replacing it, inside a "--- Added by plugin <name> ---" block. The stage must be in permissions.prompts

## What a plugin code file exports

module.exports of the file named by `main` (CommonJS). Runs in its own Node process without file system access; each call has 60 seconds. Return JSON-serializable values

### `onLoad`

`(ctx) => void | Promise<void>`

- When: After the process starts, and again after the settings are saved
- Returns: ignored

### `onEvent`

`(event: EventEnvelope, ctx) => void | Promise<void>`

- When: For each event listed in permissions.events
- Returns: ignored

### `onRequest`

`(req, ctx) => { status?: number; json?: unknown; text?: string } | unknown`

- When: The plugin's page or slot calls volath.api(path, init)
- Request: `{ method: string; path: string (starts with /); query: Record<string, unknown>; headers: Record<string, string>; body: unknown; user: { id: string; name: string; permissions: string[] } | null }`
- Returns: { status, json } or { status, text }; anything else is sent as JSON with status 200

### `onWebhook`

`(req, ctx) => { status?: number; json?: unknown; text?: string } | void`

- When: An outside system calls /api/plugin-hooks/<id>/<name> with the right secret (wrong secret, unknown name or disabled plugin: 403; over 600 calls a minute: 429)
- Request: `{ name: string; method: string; query: Record<string, unknown> (without the token); headers: Record<string, string>; rawBody: string (for checking signatures); body: unknown (parsed JSON or form) }`
- Returns: { status, json } or { status, text }; nothing answers 200 { ok: true }

### `onPrompt`

`({ stage, ticketId }, ctx) => string | { text: string } | void`

- When: Before an AI run whose stage is in permissions.prompts; the text is APPENDED at the end of the prompt in a marked block (resumed sessions get nothing)
- Returns: The text to add, or nothing. 15 seconds; an error or timeout adds nothing and never stops the run. ctx.projectId is the ticket's project, so ctx.settings are that project's values

### `tasks`

`{ [name: string]: (ctx) => void | Promise<void> }`

- When: Every `schedule[].every` for the entry whose `task` is that name

### `page`

`page`

## ctx

The object every hook receives. Namespaces for CALLS (ctx.tickets, ctx.projects...) exist for every entry of `calls`; these are the rest

- `ctx.plugin`: `{ id: string; version: string }`. This plugin
- `ctx.settings`: `Record<string, string | number | boolean>`. Values of the manifest settings: manifest defaults, then the general value, then the value of the current project; passwords decrypted
- `ctx.projectId`: `string | null`. The project of the current event / ticket, otherwise null
- `ctx.log`: `((...args: unknown[]) => void) & { info; warn; error }`. Writes to the plugin log in Settings › Plugins
- `ctx.http.fetch`: `(url: string, init?: { method?: string; headers?: Record<string, string>; body?: unknown }) => Promise<HttpResponse>`. The only way out to the network. The host must be in permissions.network; redirects are not followed; an object body is sent as JSON. No response size limit; 55 seconds
- `ctx.storage.get`: `(key: string) => Promise<unknown>`. Needs permissions.storage. null when absent
- `ctx.storage.set`: `(key: string, value: unknown) => Promise<void>`. Needs permissions.storage. JSON value, no size limit
- `ctx.storage.delete`: `(key: string) => Promise<void>`. Needs permissions.storage

## Calls

### ctx.tickets

#### `ctx.tickets.list(query?: { projectId?: string; status?: string; limit?: number })`

Recent tickets, newest first

- Returns: `Ticket[]`
- Needs: "tickets": "read" (or higher: "write")
- `query`: limit: 1-200, default 50

#### `ctx.tickets.get(ticketId: string)`

One ticket, or null

- Returns: `Ticket | null`
- Needs: "tickets": "read" (or higher: "write")
- `ticketId`: The ticket id

#### `ctx.tickets.comments(ticketId: string)`

The comments of a ticket

- Returns: `TicketComment[]`
- Needs: "tickets": "read" (or higher: "write")
- `ticketId`: The ticket id

#### `ctx.tickets.create(ticket: { title: string; projectId: string; description?: string; type?: 'Feature' | 'Bugfix' | 'Hotfix'; customFields?: CustomValues; developerId?: string; parentTicketId?: string })`

Creates a ticket (its workflow, numbering and events run as for a person)

- Returns: `Ticket`
- Needs: "tickets": "write" (counts toward the writes per minute)
- `ticket`: title is cut to 300 characters; ctx.projectId is set when handling an event

#### `ctx.tickets.update(ticketId: string, patch: { title?: string; description?: string; customFields?: Record<string, string | number | boolean | null>; developerId?: string; assignedDeveloper?: string })`

Changes a ticket; only the fields you pass change (a custom field set to null is cleared)

- Returns: `Ticket`
- Needs: "tickets": "write" (counts toward the writes per minute)
- `ticketId`: The ticket id

#### `ctx.tickets.setStatus(ticketId: string, status: string)`

Moves a ticket to a step of its workflow. A move the workflow does not allow throws

- Returns: `Ticket`
- Needs: "tickets": "write" (counts toward the writes per minute)
- `ticketId`: The ticket id

#### `ctx.tickets.comment(ticketId: string, text: string)`

Adds a comment signed "Plugin: <name>" (up to 5000 characters)

- Returns: `{ id: string }`
- Needs: "tickets": "write" (counts toward the writes per minute)
- `ticketId`: The ticket id

#### `ctx.tickets.git(ticketId: string)`

The branch and pull request of a ticket

- Returns: `TicketGit`
- Needs: "tickets": "read" (or higher: "write")
- `ticketId`: The ticket id

#### `ctx.tickets.timeline(ticketId: string)`

The timeline of a ticket, oldest first

- Returns: `TimelineEntry[]`
- Needs: "tickets": "read" (or higher: "write")
- `ticketId`: The ticket id

#### `ctx.tickets.attachments(ticketId: string)`

The documents attached to a ticket

- Returns: `Attachment[]`
- Needs: "tickets": "read" (or higher: "write")
- `ticketId`: The ticket id

### ctx.projects

#### `ctx.projects.list()`

All projects

- Returns: `Project[]`
- Needs: "projects": "read" (or higher: "write", "admin")

#### `ctx.projects.get(projectId: string)`

One project, or null

- Returns: `Project | null`
- Needs: "projects": "read" (or higher: "write", "admin")
- `projectId`: The project id

#### `ctx.projects.create(project: { name: string; description?: string; customFields?: CustomValues; repositoryPath?: string; settings?: Record<string, unknown>; createFolder?: boolean; workflow?: WorkflowInput })`

Creates a project

- Returns: `Project`
- Needs: "projects": "write" (or higher: "admin") (counts toward the writes per minute)
- `project`: repositoryPath, settings and createFolder need projects: "admin"; workflow needs workflows: "write"
- The folder (repositoryPath) is where Volath runs git and the AI; with createFolder Volath creates it and runs git init. An invalid workflow refuses the whole call before anything is created.

#### `ctx.projects.update(projectId: string, patch: { name?: string; description?: string; active?: boolean; customFields?: CustomValues; repositoryPath?: string; settings?: Record<string, unknown>; workflow?: WorkflowInput })`

Changes a project. Same extra arguments as projects.create

- Returns: `Project`
- Needs: "projects": "write" (or higher: "admin") (counts toward the writes per minute)
- `projectId`: The project id

### ctx.workflows

#### `ctx.workflows.get(projectId?: string)`

The workflow saved for exactly this project (null when it follows the general template); without a project id, the general template

- Returns: `Workflow | null`
- Needs: "workflows": "read" (or higher: "write")

#### `ctx.workflows.effective(projectId?: string)`

The workflow a project follows (its own, else the general template)

- Returns: `EffectiveWorkflow`
- Needs: "workflows": "read" (or higher: "write")

#### `ctx.workflows.defaults()`

The built-in pipeline as a graph, to start from

- Returns: `WorkflowGraph`
- Needs: "workflows": "read" (or higher: "write")

#### `ctx.workflows.save(projectId: string | null, workflow: WorkflowInput)`

Replaces the workflow of a project (null: the general template)

- Returns: `Workflow`
- Needs: "workflows": "write" (counts toward the writes per minute)
- A ticket stays when its status is a step of the new workflow; the others go back to To Do (no step is ever read as a rename). Prefer workflows.catalogApply to install a published workflow.

#### `ctx.workflows.reset(projectId: string)`

The project follows the general template again

- Returns: `{ ok: true }`
- Needs: "workflows": "write" (counts toward the writes per minute)
- `projectId`: The project id

#### `ctx.workflows.catalogList()`

The catalog: built-in workflows plus the ones people and plugins published

- Returns: `CatalogEntry[]`
- Needs: "workflows": "read" (or higher: "write")

#### `ctx.workflows.catalogPublish(workflow: WorkflowInput, description?: string)`

Adds a workflow to the catalog (it carries this plugin's badge)

- Returns: `{ id: string; name: string; steps: string[] }`
- Needs: "workflows": "write" (counts toward the writes per minute)

#### `ctx.workflows.catalogRemove(entryId: string)`

Removes a catalog entry. Only entries this plugin published itself

- Returns: `{ ok: true }`
- Needs: "workflows": "write" (counts toward the writes per minute)

#### `ctx.workflows.catalogApply(entryId: string, projectId?: string | null)`

Gives a project (null: the general template) its own copy of a catalog entry; tickets in steps the entry lacks go back to To Do

- Returns: `Workflow`
- Needs: "workflows": "write" (counts toward the writes per minute)

### ctx.developers

#### `ctx.developers.list(projectId?: string)`

The developers (project members) of a project, or of all projects

- Returns: `Developer[]`
- Needs: "developers": "read" (or higher: "write")

#### `ctx.developers.add(developer: { projectId: string; name: string; userId?: string; email?: string; githubUsername?: string; role?: string })`

Adds a person to a project: found by userId or email, else created without a login

- Returns: `Developer`
- Needs: "developers": "write" (counts toward the writes per minute)

#### `ctx.developers.update(developerId: string, patch: { name?: string; githubUsername?: string; role?: string; active?: boolean })`

Changes a developer by developer id (not user id). Email cannot be changed

- Returns: `Developer`
- Needs: "developers": "write" (counts toward the writes per minute)
- `developerId`: The developer id

#### `ctx.developers.remove(developerId: string)`

Removes a developer from a project

- Returns: `{ removed: boolean }`
- Needs: "developers": "write" (counts toward the writes per minute)
- `developerId`: The developer id

### ctx.users

#### `ctx.users.list()`

All people with an account (no emails)

- Returns: `User[]`
- Needs: "users": "read" (or higher: "write", "admin")

#### `ctx.users.get(userId: string)`

One person, or null

- Returns: `User | null`
- Needs: "users": "read" (or higher: "write", "admin")
- `userId`: The user id

#### `ctx.users.update(userId: string, patch: { name?: string; githubUsername?: string; avatarUrl?: string; active?: boolean; language?: string; customFields?: CustomValues; roleId?: string; projectIds?: string[] | null })`

Edits a person's profile. Never the email or password; no account is created or deleted

- Returns: `User`
- Needs: "users": "write" (or higher: "admin") (counts toward the writes per minute)
- `userId`: The user id
- `patch`: roleId and projectIds need users: "admin"

### ctx.customFields

#### `ctx.customFields.list(entityType?: 'ticket' | 'project' | 'user')`

Custom field definitions

- Returns: `CustomField[]`
- Needs: "customFields": "read" (or higher: "write")

#### `ctx.customFields.create(field: { code: string; name: string; entityType: 'ticket' | 'project' | 'user'; fieldType: 'text' | 'number' | 'boolean' | 'date' | 'select'; description?: string; options?: string[] })`

Creates a custom field definition (never deleted by a plugin: that would erase its values)

- Returns: `CustomField`
- Needs: "customFields": "write" (counts toward the writes per minute)
- `field`: code: lower-case letters, digits, underscores, 2-40, starting with a letter

#### `ctx.customFields.update(fieldId: string, patch: { name?: string; description?: string; options?: string[] })`

Renames a field or changes its description/options (code, entity type and field type never change)

- Returns: `CustomField`
- Needs: "customFields": "write" (counts toward the writes per minute)
- `fieldId`: The field id

### ctx.agents

#### `ctx.agents.list(projectId: string)`

The agents of a project

- Returns: `Agent[]`
- Needs: "agents": "read" (or higher: "write")
- `projectId`: The project id

#### `ctx.agents.get(agentId: string)`

One agent

- Returns: `Agent`
- Needs: "agents": "read" (or higher: "write")
- `agentId`: The agent id

#### `ctx.agents.create(projectId: string, agent: { name: string; role?: string; color?: string; instructions?: string; aiProvider?: string; aiModel?: string; skillIds?: string[]; active?: boolean })`

Creates an agent (never deleted by a plugin)

- Returns: `Agent`
- Needs: "agents": "write" (counts toward the writes per minute)
- `projectId`: The project id

#### `ctx.agents.update(agentId: string, patch: Partial<{ name: string; role: string; color: string; instructions: string; aiProvider: string; aiModel: string; skillIds: string[]; active: boolean }>)`

Changes an agent

- Returns: `Agent`
- Needs: "agents": "write" (counts toward the writes per minute)
- `agentId`: The agent id

### ctx.skills

#### `ctx.skills.list(projectId: string)`

The skills of a project

- Returns: `Skill[]`
- Needs: "skills": "read" (or higher: "write")
- `projectId`: The project id

#### `ctx.skills.get(skillId: string)`

One skill

- Returns: `Skill`
- Needs: "skills": "read" (or higher: "write")
- `skillId`: The skill id

#### `ctx.skills.create(projectId: string, skill: { name: string; description?: string; instructions?: string; active?: boolean })`

Creates a skill

- Returns: `Skill`
- Needs: "skills": "write" (counts toward the writes per minute)
- `projectId`: The project id

#### `ctx.skills.update(skillId: string, patch: Partial<{ name: string; description: string; instructions: string; active: boolean }>)`

Changes a skill

- Returns: `Skill`
- Needs: "skills": "write" (counts toward the writes per minute)
- `skillId`: The skill id

### ctx.squads

#### `ctx.squads.list(projectId: string)`

The squads of a project

- Returns: `Squad[]`
- Needs: "squads": "read" (or higher: "write")
- `projectId`: The project id

#### `ctx.squads.get(squadId: string)`

One squad

- Returns: `Squad`
- Needs: "squads": "read" (or higher: "write")
- `squadId`: The squad id

#### `ctx.squads.create(projectId: string, squad: { name: string; leaderAgentId?: string; color?: string; members?: Array<{ agentId: string; role: string }>; instructions?: string; maxSteps?: number; active?: boolean })`

Creates a squad

- Returns: `Squad`
- Needs: "squads": "write" (counts toward the writes per minute)
- `projectId`: The project id

#### `ctx.squads.update(squadId: string, patch: Partial<{ name: string; color: string; leaderAgentId: string; members: Array<{ agentId: string; role: string }>; instructions: string; maxSteps: number; active: boolean }>)`

Changes a squad

- Returns: `Squad`
- Needs: "squads": "write" (counts toward the writes per minute)
- `squadId`: The squad id

### ctx.documents

#### `ctx.documents.list(projectId: string)`

The documents of a project

- Returns: `Document[]`
- Needs: "documents": "read" (or higher: "write")
- `projectId`: The project id

#### `ctx.documents.get(documentId: string)`

One document

- Returns: `Document`
- Needs: "documents": "read" (or higher: "write")
- `documentId`: The document id

#### `ctx.documents.create(projectId: string, document: { kind: 'text' | 'link'; title?: string; text?: string; url?: string; folderId?: string })`

Adds a note (kind "text", with text) or a link (kind "link", with url). Files cannot be uploaded

- Returns: `Document`
- Needs: "documents": "write" (counts toward the writes per minute)
- `projectId`: The project id

#### `ctx.documents.update(documentId: string, patch: { title?: string; text?: string; folderId?: string })`

Changes a document's title, text or folder. Nothing is deleted by a plugin

- Returns: `Document`
- Needs: "documents": "write" (counts toward the writes per minute)
- `documentId`: The document id

#### `ctx.documents.attach(ticketId: string, documentId: string)`

Attaches a document to a ticket (same project only)

- Returns: `Document`
- Needs: "documents": "write" (counts toward the writes per minute)
- `ticketId`: The ticket id
- `documentId`: The document id

#### `ctx.documents.detach(ticketId: string, documentId: string)`

Detaches a document from a ticket

- Returns: `{ detached: boolean }`
- Needs: "documents": "write" (counts toward the writes per minute)
- `ticketId`: The ticket id
- `documentId`: The document id

### ctx.ticketTemplates

#### `ctx.ticketTemplates.list(projectId: string)`

The ticket templates of a project

- Returns: `TicketTemplate[]`
- Needs: "ticketTemplates": "read" (or higher: "write")
- `projectId`: The project id

#### `ctx.ticketTemplates.get(templateId: string)`

One template

- Returns: `TicketTemplate`
- Needs: "ticketTemplates": "read" (or higher: "write")
- `templateId`: The template id

#### `ctx.ticketTemplates.create(projectId: string, template: { name: string; title: string; description?: string; type?: string; validationCriteria?: unknown[]; agentId?: string; squadId?: string; labels?: string[]; customFields?: CustomValues; scheduleCron?: string; scheduleEnabled?: boolean })`

Creates a template (making a ticket from one is tickets.create)

- Returns: `TicketTemplate`
- Needs: "ticketTemplates": "write" (counts toward the writes per minute)
- `projectId`: The project id

#### `ctx.ticketTemplates.update(templateId: string, patch: Partial<TicketTemplate>)`

Changes a template

- Returns: `TicketTemplate`
- Needs: "ticketTemplates": "write" (counts toward the writes per minute)
- `templateId`: The template id

### ctx.boardViews

#### `ctx.boardViews.list(projectId: string)`

The shared board views of a project

- Returns: `BoardView[]`
- Needs: "boardViews": "read" (or higher: "write")
- `projectId`: The project id

#### `ctx.boardViews.create(projectId: string, view: { name: string; filters?: BoardViewFilters })`

Creates a shared board view

- Returns: `BoardView`
- Needs: "boardViews": "write" (counts toward the writes per minute)
- `projectId`: The project id

#### `ctx.boardViews.update(viewId: string, patch: { name?: string; filters?: BoardViewFilters })`

Changes a board view

- Returns: `BoardView`
- Needs: "boardViews": "write" (counts toward the writes per minute)
- `viewId`: The view id

### ctx.webhooks

#### `ctx.webhooks.list(projectId: string)`

The webhooks of a project (never the secrets)

- Returns: `Webhook[]`
- Needs: "webhooks": "read" (or higher: "write")
- `projectId`: The project id

#### `ctx.webhooks.create(projectId: string, webhook: { url: string; name?: string; format?: 'json' | 'slack' | 'teams'; events?: string[]; enabled?: boolean; secret?: string })`

Creates a webhook (carries this plugin's badge)

- Returns: `Webhook`
- Needs: "webhooks": "write" (counts toward the writes per minute)
- `projectId`: The project id
- `webhook`: secret signs deliveries and is write-only

#### `ctx.webhooks.update(webhookId: string, patch: Partial<{ url: string; name: string; format: string; events: string[]; enabled: boolean; secret: string }>)`

Changes a webhook. Only webhooks this plugin created

- Returns: `Webhook`
- Needs: "webhooks": "write" (counts toward the writes per minute)
- `webhookId`: The webhook id

#### `ctx.webhooks.remove(webhookId: string)`

Removes a webhook. Only webhooks this plugin created

- Returns: `unknown`
- Needs: "webhooks": "write" (counts toward the writes per minute)
- `webhookId`: The webhook id

### ctx.notifications

#### `ctx.notifications.create(notification: { title: string; message?: string; level?: 'info' | 'success' | 'warning' | 'error'; ticketId?: string; needsAttention?: boolean })`

Puts a notification in the bell ("(<plugin name>)" is appended to the message)

- Returns: `{ id: string | null }`
- Needs: "notifications": true (counts toward the writes per minute)

### ctx.actions

#### `ctx.actions.analyze(ticketId: string)`

Runs the AI analysis of a ticket in the background

- Returns: `ActionResult`
- Needs: "actions": true or a list containing "analyze" (counts toward the writes per minute)
- `ticketId`: The ticket id
- Same as pressing the button: approval gates, AI budgets, workflow-step checks and blocked tickets still apply. Each adds a "(plugin X)" line to the ticket activity log.

#### `ctx.actions.develop(ticketId: string)`

Starts the AI development, or moves the ticket to the development step of its workflow

- Returns: `ActionResult`
- Needs: "actions": true or a list containing "develop" (counts toward the writes per minute)
- `ticketId`: The ticket id
- Same as pressing the button: approval gates, AI budgets, workflow-step checks and blocked tickets still apply. Each adds a "(plugin X)" line to the ticket activity log.

#### `ctx.actions.stop(ticketId: string)`

Stops the running development session

- Returns: `ActionResult`
- Needs: "actions": true or a list containing "stop" (counts toward the writes per minute)
- `ticketId`: The ticket id
- Same as pressing the button: approval gates, AI budgets, workflow-step checks and blocked tickets still apply. Each adds a "(plugin X)" line to the ticket activity log.

#### `ctx.actions.pullRequest(ticketId: string)`

Opens the pull request of the ticket's branch

- Returns: `ActionResult`
- Needs: "actions": true or a list containing "pullRequest" (counts toward the writes per minute)
- `ticketId`: The ticket id
- Same as pressing the button: approval gates, AI budgets, workflow-step checks and blocked tickets still apply. Each adds a "(plugin X)" line to the ticket activity log.

#### `ctx.actions.runTests(ticketId: string)`

Starts a live test

- Returns: `ActionResult & { runId: string }`
- Needs: "actions": true or a list containing "tests" (counts toward the writes per minute)
- `ticketId`: The ticket id
- Same as pressing the button: approval gates, AI budgets, workflow-step checks and blocked tickets still apply. Each adds a "(plugin X)" line to the ticket activity log.

#### `ctx.actions.merge(ticketId: string)`

Merges the ticket's branch into its parent branch

- Returns: `ActionResult`
- Needs: "actions": true or a list containing "merge" (counts toward the writes per minute)
- `ticketId`: The ticket id
- Same as pressing the button: approval gates, AI budgets, workflow-step checks and blocked tickets still apply. Each adds a "(plugin X)" line to the ticket activity log.

#### `ctx.actions.approve(ticketId: string)`

Answers the approval gate the ticket waits at (throws when nothing waits)

- Returns: `ActionResult`
- Needs: "actions": true or a list containing "approve" (counts toward the writes per minute)
- `ticketId`: The ticket id
- Same as pressing the button: approval gates, AI budgets, workflow-step checks and blocked tickets still apply. Each adds a "(plugin X)" line to the ticket activity log.

#### `ctx.actions.reject(ticketId: string)`

Rejects the approval gate the ticket waits at

- Returns: `ActionResult`
- Needs: "actions": true or a list containing "approve" (counts toward the writes per minute)
- `ticketId`: The ticket id
- Same as pressing the button: approval gates, AI budgets, workflow-step checks and blocked tickets still apply. Each adds a "(plugin X)" line to the ticket activity log.

#### `ctx.actions.resumeJob(ticketId: string, jobId: string)`

Resumes an interrupted or failed AI job

- Returns: `ActionResult`
- Needs: "actions": true or a list containing "jobs" (counts toward the writes per minute)
- `ticketId`: The ticket id
- Same as pressing the button: approval gates, AI budgets, workflow-step checks and blocked tickets still apply. Each adds a "(plugin X)" line to the ticket activity log.

#### `ctx.actions.cancelJob(ticketId: string, jobId: string)`

Dismisses an interrupted or failed AI job

- Returns: `ActionResult`
- Needs: "actions": true or a list containing "jobs" (counts toward the writes per minute)
- `ticketId`: The ticket id
- Same as pressing the button: approval gates, AI budgets, workflow-step checks and blocked tickets still apply. Each adds a "(plugin X)" line to the ticket activity log.

## Events

Every event arrives as an envelope:

Delivered to onEvent and used by declarative actions. A plugin never receives the events its own calls caused (actor says which plugin did, otherwise null)

- `event`: string (the event name)
- `type`: string (same as event)
- `deliveryId`: string (uuid)
- `timestamp`: string (ISO date)
- `project`: { id: string; name?: string; customFields: CustomValues } | null
- `ticket`: { id: string; number?: number; title?: string; customFields?: CustomValues } | null
- `data`: the event data (see events)
- `actor`: { type: 'plugin'; id: string } | null

### `ticket.status_changed`

A ticket moved to another step (After the move)

- data: `{ from: string; to: string }`

### `pr.opened`

A pull request was opened for a ticket (After Volath opens it)

- data: `{ number: number; url: string; title: string; draft: boolean; branch: string | null; base: string | null }`

### `test.finished`

A live test finished (When the run ends)

- data: `{ result: string; environment: string; url: string | null; passed: number; total: number; failed: Array<{ step: string; error: string | null }> }`

### `ci.failed`

CI failed on a ticket's pull request (When Volath sees the failed checks)

- data: `{ checks: string[]; commit: string | null; pullRequestUrl: string | null; fixRound: number }`

### `deploy.finished`

A ticket was deployed to staging (After the deploy)

- data: `{ environment: 'staging'; branch: string; deployBranch: string | null; deployedAt: string }`

### `budget.exceeded`

A ticket hit its AI budget (When the run is stopped)

- data: `{ reason: string }`

### `approval.requested`

A ticket waits for a person to approve (When the gate is reached)

- data: `{ gate: 'development' | 'pull-request' | 'merge' | 'parent-merge' | 'workflow'; reason: string }`

### `digest`

The periodic digest of a project (When the digest is sent)

- data: `{ project: { id: string; name: string } | null; merged: unknown[]; stuck: unknown[]; waitingApproval: unknown[]; failedCi: unknown[]; reviewRequests: unknown[]; aiSpend: { total: number; previous: number; runs: number; failedRuns: number; topTickets: unknown[] } & Record<string, unknown> } & Record<string, unknown>`
- The digest report; log it once to see every field.

### `ticket.updated`

A ticket changed (status, pull request, CI...) (After the change)

- data: `TicketEventData`

### `ticket.deleted`

A ticket was deleted (After the delete)

- data: `{ id: string }`

### `ticket.timeline`

A line was added to a ticket's timeline (After it is saved)

- data: `{ action: string; commitHash: string | null; timestamp: string }`

### `ticket.activity`

A line was added to a ticket's activity log (After it is saved)

- data: `{ category: string; headline: string; message: string; timestamp: string }`

### `ai.job`

An AI job (analysis or development) changed (On every change of the job)

- data: `{ id: string; ticketId: string; kind: 'analysis' | 'development'; status: 'running' | 'done' | 'failed' | 'interrupted' | 'resumed' | 'cancelled'; options: Record<string, unknown> | null; resumeCount: number; error: string | null; createdAt: string; updatedAt: string }`

### `notification`

A notification was added to the bell (After it is saved)

- data: `{ title: string; message: string; level: 'info' | 'success' | 'warning' | 'error'; needsAttention: boolean }`

### `ticket.reverted`

A merged ticket was reverted (After the revert pull request)

- data: `{ number: number; url: string; base: string; reason: string | null }`

### `release.published`

A release was published (After it is published (no ticket))

- data: `{ version: string; title: string; notes: string; url: string | null }`

### `workflow.notify`

A Notify step of a workflow ran (When a ticket enters the step)

- data: `{ step: string; message: string; ticket: { id: string; number: number; title: string } }`

### `ticket.created`

A ticket was created (After it is saved)

- data: `TicketEventData & { description: string; parentTicketId: string | null }`
- event.ticket.customFields has the custom fields it was created with.

### `ticket.comment_added`

A comment was added to a ticket (After it is saved)

- data: `{ id: string; author: string; content: string (cut to 2000 characters) }`

### `project.created`

A project was created (After it is saved)

- data: `ProjectEventData`

### `project.updated`

A project was changed (After it is saved)

- data: `ProjectEventData`

### `project.deleted`

A project was deleted (After the delete)

- data: `{ id: string; name: string }`

### `developer.created`

A developer was added to a project (After it is saved)

- data: `Developer`

### `developer.updated`

A developer was changed (After it is saved)

- data: `Developer`

### `customfield.created`

A custom field was defined (After it is saved)

- data: `CustomFieldEventData`

### `customfield.updated`

A custom field was changed (After it is saved)

- data: `CustomFieldEventData`

### `customfield.deleted`

A custom field was deleted (After the delete)

- data: `CustomFieldEventData`

### `workflow.updated`

A workflow was saved or reset (After tickets followed the change)

- data: `{ projectId: string | null; name: string; steps: string[]; reset: boolean }`

### `entity.<table>.created | entity.<table>.updated | entity.<table>.deleted`

Every row written to the database is an event, named after its table (entity.users.updated, entity.agents.created, entity.project_members.created...). The named events above stay and carry richer data

- data: `{ table: string; id: string | null; row: Record<string, unknown>; changed?: string[] (updated only: the columns that changed) }`
- row has every column except those that look like secrets (names matching pass, secret, token, hash, salt, credential, api key, private, email); text over 5000 characters is cut.
- Left out because they are bookkeeping: activity_logs, notifications, ai_jobs, ai_costs, package_usage, runtime_state, user_sessions, api_tokens, app_settings, assistant_*, self_improve_*, live_test_runs, timelines.
- event.project / event.ticket are filled when the row has a projectId / ticketId (or is a project / ticket).
- Developers are rows of project_members; people are rows of users. Webhooks created in Settings › Webhooks never receive these unless they list them by name.

## Types

### CustomValues

Custom field values by field code

```ts
type CustomValues = Record<string, string | number | boolean>
```

### Ticket

A ticket as a plugin sees it (never its settings, which hold credentials)

```ts
interface Ticket {
  id: string;
  ticketNumber: number;
  title: string;
  description: string;
  type: 'Feature' | 'Bugfix' | 'Hotfix';
  status: string (a step of the project workflow);
  projectId: string;
  developerId: string | null;
  assignedDeveloper: string | null;
  parentTicketId: string | null;
  customFields: CustomValues;
}
```

### TicketComment

A comment on a ticket

```ts
interface TicketComment {
  id: string;
  author: string;
  content: string;
  createdAt: string (ISO date);
}
```

### TicketGit

The git side of a ticket

```ts
interface TicketGit {
  branch: string | null;
  pullRequest: { number: number; url: string | null; status: string | null; title: string | null; description: string | null } | null;
}
```

### TimelineEntry

One line of the ticket timeline, oldest first

```ts
interface TimelineEntry {
  id: string;
  icon: string;
  title: string;
  commit: string | null;
  at: string (ISO date);
}
```

### Attachment

A document attached to a ticket

```ts
interface Attachment {
  id: string;
  kind: DocumentKind;
  title: string;
  url: string | null;
  fileName: string | null;
  size: number;
}
```

### Project

A project (never its folder on disk or its settings)

```ts
interface Project {
  id: string;
  name: string;
  description: string;
  active: boolean;
  origin: string | null;
  customFields: CustomValues;
}
```

### Developer

A member of a project: a person (user) on that project. `id` is the membership id, which developers.update/remove take

```ts
interface Developer {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  githubUsername: string | null;
  role: string | null;
  avatarUrl: string | null;
  active: boolean;
  hasLogin: boolean;
  customFields: CustomValues;
  createdAt: string (ISO date);
  updatedAt: string (ISO date);
}
```

### User

A person with an account. Never the email or a password

```ts
interface User {
  id: string;
  name: string;
  githubUsername: string | null;
  avatarUrl: string | null;
  hasLogin: boolean;
  roleId: string;
  role: string;
  active: boolean;
  projectIds: string[] | null (null = all projects);
  language: string;
  customFields: CustomValues;
}
```

### CustomField

The definition of a custom field

```ts
interface CustomField {
  id: string;
  code: string;
  name: string;
  description: string;
  entityType: 'ticket' | 'project' | 'user';
  fieldType: 'text' | 'number' | 'boolean' | 'date' | 'select';
  options: string[] | null;
}
```

### WorkflowAction

What a step does when a ticket enters it

```ts
interface WorkflowAction {
  type: 'analyze' | 'develop' | 'create_pr' | 'check_ci' | 'review' | 'merge_staging' | 'run_tests' | 'merge' | 'comment' | 'notify' | 'request_approval' | 'security_scan' | 'wait';
  auto?: boolean (merge: merge by itself);
  text?: string (comment / notify / request_approval);
  minutes?: number (wait);
}
```

### WorkflowNode

A step of a workflow; its `status` is the status of the tickets in it. The steps "To Do" and "Done" are required

```ts
interface WorkflowNode {
  id: string (n0, n1... by position);
  status: string;
  color?: string;
  kind?: 'step' | 'decision' | 'parallel' | 'gate';
  note?: string;
  actions: WorkflowAction[];
  done?: boolean;
  trackerState?: string;
  autostart?: boolean;
  hidden?: boolean;
  x: number;
  y: number;
}
```

### WorkflowEdge

An arrow between two steps; all its conditions must hold

```ts
interface WorkflowEdge {
  id: string;
  from: string (node id);
  to: string (node id);
  auto: boolean (taken by itself once the conditions hold);
  conditions: Array<{ type: 'approvals' | 'no_changes_requested' | 'ci_passed' | 'has_pull_request' | 'ticket_type' | 'analysis_viable' | 'analysis_not_viable' | 'development_done' | 'deployed' | 'tests_passed' | 'approved' | 'scan_passed' | 'scan_failed' | 'waited'; value?: number | string }>;
}
```

### WorkflowGraph

The steps and arrows of a workflow

```ts
interface WorkflowGraph {
  name?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
```

### WorkflowInput

A workflow you hand over: "default" (the built-in pipeline), "local" (no remote repository) or your own graph

```ts
type WorkflowInput = 'default' | 'local' | WorkflowGraph
```

### Workflow

A saved workflow

```ts
interface Workflow {
  id: string;
  projectId: string | null (null = the general template);
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
```

### EffectiveWorkflow

The workflow a project follows

```ts
interface EffectiveWorkflow {
  source: 'project' | 'general';
  workflow: Workflow;
  statuses: string[];
}
```

### CatalogEntry

A workflow of the catalog (built-in ones have builtin: true)

```ts
interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  steps: string[];
}
```

### Agent

An AI agent of a project

```ts
interface Agent {
  id: string;
  projectId: string;
  name: string;
  role: string | null;
  color: string | null;
  instructions: string;
  aiProvider: string | null;
  aiModel: string | null;
  skillIds: string[];
  active: boolean;
  createdAt: string (ISO date);
  updatedAt: string (ISO date);
}
```

### Skill

A skill agents can use

```ts
interface Skill {
  id: string;
  projectId: string;
  name: string;
  description: string;
  instructions: string;
  active: boolean;
  createdAt: string (ISO date);
  updatedAt: string (ISO date);
}
```

### Squad

A team of agents with a leader

```ts
interface Squad {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
  leaderAgentId: string;
  members: Array<{ agentId: string; role: string }> | null;
  instructions: string;
  maxSteps: number;
  active: boolean;
  createdAt: string (ISO date);
  updatedAt: string (ISO date);
}
```

### DocumentKind

What a project document is

```ts
type DocumentKind = 'file' | 'image' | 'audio' | 'video' | 'text' | 'link' | 'figma'
```

### Document

A note or link of a project (the path of a stored file never leaves)

```ts
interface Document {
  id: string;
  projectId: string;
  kind: DocumentKind;
  title: string;
  url: string | null;
  text: string (the note, or what Volath read from the link/file);
  size: number;
  folderId: string | null;
  fileName: string | null;
  createdAt: string (ISO date);
}
```

### TicketTemplate

A template tickets are made from

```ts
interface TicketTemplate {
  id: string;
  projectId: string;
  name: string;
  title: string;
  description: string;
  type: string;
  validationCriteria: unknown[] | null;
  agentId: string | null;
  squadId: string | null;
  aiProviderOverride: string | null;
  aiModelOverride: string | null;
  labels: string[] | null;
  customFields: CustomValues | null;
  scheduleCron: string | null;
  scheduleEnabled: boolean;
  lastRunAt: string | null;
  lastTicketId: string | null;
  createdAt: string (ISO date);
  updatedAt: string (ISO date);
}
```

### BoardViewFilters

The filters a board view pins

```ts
interface BoardViewFilters {
  search?: string;
  assignee?: string;
  provider?: string;
  status?: string;
  label?: string;
  tag?: string;
  ci?: 'failed' | 'passed' | 'pending' | 'stopped' | 'none';
  minSpend?: number | null;
}
```

### BoardView

A named set of board filters shown as a tab; views made by a plugin are shared with everybody

```ts
interface BoardView {
  id: string;
  projectId: string;
  name: string;
  filters: BoardViewFilters;
  shared: boolean;
  createdAt: string (ISO date);
  updatedAt: string (ISO date);
}
```

### Webhook

A webhook Volath sends to another system. Secrets are never returned

```ts
interface Webhook {
  id: string;
  projectId: string;
  name: string;
  url: string;
  format: 'json' | 'slack' | 'teams';
  events: string[] | null (null = all);
  enabled: boolean;
  hasSecret: boolean;
  hasChatSecret: boolean;
  chatApprovers?: string[] | null;
  createdByThisPlugin?: boolean (webhooks.list only);
  createdAt: string (ISO date);
}
```

### HttpResponse

What ctx.http.fetch returns. A non-2xx answer does not throw: check `ok`

```ts
interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string (the text of the response);
  json: unknown (parsed body, or null when it is not JSON);
}
```

### ActionResult

What ctx.actions functions return

```ts
interface ActionResult {
  ok: true;
  ticketId: string;
  status: string;
  alreadyRunning?: boolean (develop);
  runId?: string (runTests);
}
```

### TicketEventData

The state of a ticket in an event

```ts
interface TicketEventData {
  id: string;
  number: number;
  title: string;
  type: string;
  status: string;
  developer: string | null;
  branch: string | null;
  parentBranch: string | null;
  pullRequest: { number: number; url: string | null; status: string | null } | null;
  ciState: string | null;
  needsAttention: string | null;
  updatedAt: string (ISO date);
}
```

### ProjectEventData

A project in an event (no settings)

```ts
interface ProjectEventData {
  id: string;
  name: string;
  description: string;
  active: boolean;
  customFields: CustomValues;
}
```

### CustomFieldEventData

A custom field definition in an event

```ts
interface CustomFieldEventData {
  id: string;
  code: string;
  name: string;
  entityType: string;
  fieldType: string;
  options: string[] | null;
}
```

---

## Working examples

### Example: hello-dashboard

`plugin.json`

```json
{
  "id": "hello-dashboard",
  "name": "Hello dashboard",
  "version": "1.0.0",
  "apiVersion": 1,
  "description": "Example plugin: tells an external dashboard API when a ticket is merged, keeps the list of merged tickets and shows it on its own page.",
  "author": "Volath",
  "main": "index.js",
  "permissions": {
    "network": ["dashboard.example.com"],
    "tickets": "read",
    "events": ["ticket.status_changed"],
    "storage": true
  },
  "settings": [
    { "key": "baseUrl", "label": "Dashboard URL", "type": "text", "fallback": "https://dashboard.example.com", "help": "Where the dashboard API lives." },
    { "key": "token", "label": "API token", "type": "password", "help": "Sent as a Bearer token." }
  ],
  "ui": { "entry": "ui/index.html", "title": "Merged tickets", "icon": "LayoutDashboard" },
  "actions": [
    {
      "on": "ticket.status_changed",
      "when": { "data.to": "Done" },
      "http": {
        "method": "POST",
        "url": "{{settings.baseUrl}}/api/deployments",
        "headers": { "Authorization": "Bearer {{settings.token}}" },
        "body": { "ticket": "{{event.ticket.number}}", "title": "{{event.ticket.title}}", "project": "{{event.project.name}}" }
      }
    }
  ]
}
```

`index.js`

```js
'use strict';

module.exports = {
  /** Every event the manifest subscribes to (permissions.events). */
  async onEvent(event, ctx) {
    if (event.type !== 'ticket.status_changed' || event.data.to !== 'Done') return;
    const merged = (await ctx.storage.get('merged')) || [];
    merged.unshift({ number: event.ticket.number, title: event.ticket.title, at: event.timestamp });
    await ctx.storage.set('merged', merged.slice(0, 50));
    ctx.log(`Remembered ticket #${event.ticket.number}`);
  },

  /** Calls made by the page of the plugin: volath.api('/merged') arrives here with path "/merged". */
  async onRequest(req, ctx) {
    if (req.path === '/merged') return { json: (await ctx.storage.get('merged')) || [] };
    if (req.path === '/ping') return { json: { ok: true, user: req.user && req.user.name } };
    return { status: 404, json: { error: 'Not found' } };
  },
};
```

### Example: project-bootstrap

`plugin.json`

```json
{
  "id": "project-bootstrap",
  "name": "Project bootstrap",
  "version": "1.0.0",
  "apiVersion": 1,
  "description": "When a project is created, adds a default developer to it and makes sure the ticket custom field \"cost_center\" exists. No code: actions that ask Volath to do things.",
  "author": "Volath",
  "permissions": {
    "developers": "write",
    "customFields": "write",
    "events": ["project.created"]
  },
  "settings": [
    { "key": "developerName", "label": "Default developer", "type": "text", "required": true, "help": "Added to every new project." },
    { "key": "developerEmail", "label": "Developer email", "type": "text" }
  ],
  "actions": [
    {
      "on": "project.created",
      "call": "developers.add",
      "args": { "projectId": "{{event.project.id}}", "name": "{{settings.developerName}}", "email": "{{settings.developerEmail}}", "role": "Developer" }
    },
    {
      "on": "project.created",
      "call": "customFields.create",
      "args": { "code": "cost_center", "name": "Cost center", "entityType": "ticket", "fieldType": "text" }
    }
  ]
}
```

### Example: project-workflow

`plugin.json`

```json
{
  "id": "project-workflow",
  "name": "Project workflow",
  "version": "1.0.0",
  "apiVersion": 1,
  "description": "Gives every new project the workflow Volath ships for projects without a remote repository (no CI, review or staging steps). No code: one action that asks Volath to install it.",
  "author": "Volath",
  "permissions": {
    "workflows": "write",
    "events": ["project.created"]
  },
  "actions": [
    {
      "on": "project.created",
      "call": "workflows.save",
      "args": ["{{event.project.id}}", "local"]
    }
  ]
}
```

### Example: ticket-mirror

`plugin.json`

```json
{
  "id": "ticket-mirror",
  "name": "Ticket mirror",
  "version": "1.0.0",
  "apiVersion": 1,
  "description": "Creates the same ticket in another system through its API whenever a ticket is created here. No code: one declarative action.",
  "author": "Volath",
  "permissions": {
    "network": ["api.example.com"],
    "events": ["ticket.created"]
  },
  "settings": [
    { "key": "baseUrl", "label": "API URL", "type": "text", "fallback": "https://api.example.com", "help": "Where the other system listens." },
    { "key": "token", "label": "API token", "type": "password", "required": true }
  ],
  "actions": [
    {
      "on": "ticket.created",
      "http": {
        "method": "POST",
        "url": "{{settings.baseUrl}}/issues",
        "headers": { "Authorization": "Bearer {{settings.token}}" },
        "body": {
          "externalId": "{{event.ticket.id}}",
          "number": "{{event.ticket.number}}",
          "title": "{{event.ticket.title}}",
          "description": "{{event.data.description}}",
          "type": "{{event.data.type}}",
          "project": "{{event.project.name}}"
        }
      }
    }
  ]
}
```

### Example: ticket-triage

`plugin.json`

```json
{
  "id": "ticket-triage",
  "name": "Ticket triage",
  "version": "1.0.0",
  "apiVersion": 1,
  "description": "Reacts to new tickets in code: fills a custom field, leaves a comment and tells the team. Shows ctx.tickets, ctx.developers and ctx.notifications.",
  "author": "Volath",
  "main": "index.js",
  "permissions": {
    "tickets": "write",
    "developers": "read",
    "notifications": true,
    "storage": true,
    "events": ["ticket.created"]
  },
  "settings": [
    { "key": "keyword", "label": "Mark tickets that mention", "type": "text", "fallback": "urgent" }
  ]
}
```

`index.js`

```js
'use strict';

module.exports = {
  async onEvent(event, ctx) {
    if (event.type !== 'ticket.created') return;
    const ticket = event.ticket;
    const mentions = `${ticket.title} ${event.data.description || ''}`.toLowerCase().includes(String(ctx.settings.keyword).toLowerCase());

    // Count what this plugin has seen (storage survives restarts)
    const seen = ((await ctx.storage.get('seen')) || 0) + 1;
    await ctx.storage.set('seen', seen);

    // The first developer of the project takes the ticket when it is marked
    if (mentions && ctx.projectId) {
      const [first] = await ctx.developers.list(ctx.projectId);
      if (first) await ctx.tickets.update(ticket.id, { developerId: first.id });
      await ctx.tickets.comment(ticket.id, `Marked as ${ctx.settings.keyword}${first ? ` and given to ${first.name}` : ''}.`);
      await ctx.notifications.create({ title: `#${ticket.number} ${ctx.settings.keyword}`, message: ticket.title, level: 'warning', ticketId: ticket.id, needsAttention: true });
    }
    ctx.log(`Triaged ticket #${ticket.number} (${seen} seen)`);
  },
};
```

### Example: ui-slots

`plugin.json`

```json
{
  "id": "ui-slots",
  "name": "UI slots demo",
  "version": "1.0.0",
  "apiVersion": 1,
  "description": "Puts a widget on the board, a button in the top bar, a menu item, a ticket tab and a project tab. Shows ui.slots.",
  "author": "Volath",
  "main": "index.js",
  "permissions": { "tickets": "read" },
  "ui": {
    "slots": [
      { "slot": "board", "title": "Today", "entry": "ui/board.html", "height": 90 },
      { "slot": "topbar", "title": "Quick links", "icon": "Bell", "links": [{ "label": "Volath help", "url": "https://github.com/volath" }] },
      { "slot": "menu", "title": "Ticket counts", "entry": "ui/counts.html" },
      { "slot": "ticket.tab", "title": "Ticket facts", "entry": "ui/ticket.html", "height": 120 },
      { "slot": "ticket.panel", "title": "Note", "text": "This panel comes from a plugin." },
      { "slot": "project.tab", "title": "Project facts", "entry": "ui/ticket.html", "height": 120 }
    ]
  }
}
```

`index.js`

```js
/**
 * The code behind the pages: they call it with volath.api(path). A page of a slot also knows where it is shown:
 * volath.context = { slot, projectId, ticketId } (ids only).
 */
module.exports = {
  async onRequest(req, ctx) {
    if (req.path === '/counts') {
      const tickets = await ctx.tickets.list({ projectId: req.query.projectId, limit: 500 });
      const byStatus = {};
      for (const t of tickets) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      return { status: 200, json: byStatus };
    }
    if (req.path === '/ticket') {
      const t = await ctx.tickets.get(req.query.ticketId);
      return { status: 200, json: { number: t.ticketNumber, title: t.title, status: t.status } };
    }
    return { status: 404, json: { error: 'unknown path' } };
  },
};
```
