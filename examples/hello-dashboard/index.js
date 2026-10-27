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
