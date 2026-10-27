# Volath SDK

Everything you need to build a plugin for [Volath](https://github.com/riftwebdev/volath-source): the tool that checks and packs plugins, TypeScript types, a JSON Schema for `plugin.json`, a complete reference, and a guide written to be handed to an AI assistant.

A plugin is a zip with a `plugin.json` and, if it needs code, one Node file. It can react to anything that happens in Volath, act on tickets, projects, workflows, people, agents, documents and more, call outside APIs, receive webhooks, append to AI prompts and add buttons, widgets and tabs to the interface. Everything it creates is shown in Volath with a "from plugin X" badge.

Plugins do **not** have to come from a marketplace: any zip can be installed in **Settings › Plugins**. The official ones live in [volath/marketplace](https://github.com/volath/marketplace) and can be installed from **Settings › Plugins › Marketplace**; Volath marks each plugin as "From the marketplace" or "Installed from a zip", and an administrator can choose to allow marketplace plugins only.

## Quick start

```
npx @volath/sdk new my-plugin               # or: --template ticket-triage | ticket-mirror | project-bootstrap | ...
cd my-plugin
npx @volath/sdk validate .                  # checks plugin.json and the files it points to
npx @volath/sdk test .                      # runs it like Volath does with sample events (calls out only with --live)
npx @volath/sdk pack .                      # my-plugin-0.1.0.zip: install it in Settings › Plugins
```

(`volath-plugin` is the name of the command once the package is installed.) Needs Node 20 or later.

## Writing a plugin with an AI

Give your assistant **[docs/AI_GUIDE.md](docs/AI_GUIDE.md)**. It is one file with the rules, every function, event, permission and manifest field, the limits, and working examples, so the assistant does not have to guess. A project made by `new` also gets an `AGENTS.md` that points assistants there.

| File | What it is |
|---|---|
| [docs/AI_GUIDE.md](docs/AI_GUIDE.md) | Rules + reference + examples in one file, for an AI |
| [docs/REFERENCE.md](docs/REFERENCE.md) | The reference alone: all calls, events, permissions, hooks, limits |
| [types/index.d.ts](types/index.d.ts) | TypeScript types for `ctx`, events, hooks and `plugin.json` |
| [schema/plugin.schema.json](schema/plugin.schema.json) | JSON Schema for `plugin.json` (editors validate and complete from it) |
| [llms.txt](llms.txt) | Where an AI should start |
| [examples](examples) | Working plugins: no code, code, a page with slots, workflows, developers... |

## Editor help

In a plugin's code file:

```js
/** @type {import('@volath/sdk').PluginModule} */
module.exports = {
  async onEvent(event, ctx) {
    if (event.type === 'ticket.created') {
      await ctx.tickets.comment(event.ticket.id, 'Thanks, we will look at it.');
    }
  },
};
```

and in `plugin.json`: `"$schema": "node_modules/@volath/sdk/schema/plugin.schema.json"`.

## How this repository is built

The plugin API is defined once, in the Volath app (`backend/assets/plugin-sdk`). This repository vendors that tool into `lib/` and **generates** the types, schema and docs from the machine-readable description in `lib/api-docs.js`, so they cannot drift from what Volath really accepts.

```
npm run sync       # copy the plugin tool and examples from the Volath app (set VOLATH_PLUGIN_SDK or pass the path)
npm run generate   # write types/, schema/, docs/ and llms.txt
npm run check      # fails when the generated files are out of date (CI runs it)
```

Do not edit the generated files by hand.

## License

[MIT](LICENSE).
