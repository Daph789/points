const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
for (const side of [false, true]) {
  test(`${side ? 'Side group' : 'Plan chat'} deletion respects body constraint and removes original text`, async () => {
    const route = side ? '/api/social-plans/:id/side-group/:status/messages/:messageId' : '/api/social-plans/:id/chat/:messageId';
    const start = source.indexOf(`app.delete("${route}"`);
    const end = source.indexOf('\n});', start) + 4;
    let handler, saved;
    const query = { select() { return this; }, eq() { return this; },
      update(value) { saved = value; return this; },
      async maybeSingle() {
        if (!saved) return { data: { id: 'message', plan_id: 'plan', sender_id: 'owner' } };
        // Existing production schema: char_length(body) between 1 and 800.
        if (!saved.body.length || saved.body.length > 800) return { error: { code: '23514' } };
        return { data: { id: 'message', ...saved } };
      } };
    const context = { app: { delete(path, fn) { handler = fn; } },
      supabaseAdmin: { from() { return query; } },
      getAuthenticatedUser: async () => ({ user: { id: 'owner' } }),
      ensureProfileForUser: async () => ({ id: 'owner' }),
      getSocialPlanChatAccess: async () => ({ allowed: true, plan: { id: 'plan' } }),
      getSideGroupAccess: async () => ({ allowed: true, plan: { id: 'plan' } }),
      enrichPlanChatMessages: async rows => rows, enrichSideMessages: async rows => rows,
      socialPlanMessageSelect: '*', sideGroupMessageSelect: '*', console };
    vm.runInNewContext(source.slice(start, end), context);
    let status = 200, result;
    const response = { status(code) { status = code; return this; }, json(body) { result = body; } };
    await handler({ params: { id: 'plan', messageId: 'message', status: 'accepted' } }, response);
    assert.equal(status, 200);
    assert.ok(result.message.deleted_at);
    assert.equal(result.message.body.trim(), '');
    assert.equal([result.message].filter(message => !message.deleted_at).length, 0);
  });
}
