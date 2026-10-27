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
