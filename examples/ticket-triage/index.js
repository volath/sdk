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
