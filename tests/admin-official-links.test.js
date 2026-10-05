import test from 'node:test';
import assert from 'node:assert/strict';
import { registerOfficialLinkRoutes } from '../admin-official-links.js';

function setup({ allowed = true, result = { data: [], count: 0, error: null } } = {}) {
  const routes = new Map();
  const calls = [];
  const chain = {};
  for (const name of ['select', 'ilike', 'order', 'range', 'insert', 'update', 'eq', 'delete', 'maybeSingle']) {
    chain[name] = (...args) => { calls.push([name, ...args]); return chain; };
  }
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  registerOfficialLinkRoutes({ post: (path, handler) => routes.set(path, handler) }, {
    supabaseAdmin: { from: name => { calls.push(['from', name]); return chain; } },
    authenticateAdminAccess: async (request, options) => {
      assert.equal(options, undefined, 'Do not enable secondary admin access');
      return allowed ? { actor: { type: 'primary' } } : { error: 'Mot de passe incorrect', status: 401 };
    },
  });
  async function request(endpoint, body = {}) {
    const response = { code: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await routes.get(`/api/admin/official-links/${endpoint}`)({ body }, response);
    return response;
  }
  return { request, calls };
}
const id = '12345678-1234-1234-1234-123456789abc';

test('all operations reject unauthorized users before accessing private data', async () => {
  const { request, calls } = setup({ allowed: false });
  for (const endpoint of ['list', 'save', 'delete']) {
    const response = await request(endpoint);
    assert.equal(response.code, 401);
    assert.equal(response.headers['Cache-Control'], 'no-store');
  }
  assert.deepEqual(calls, []);
});

test('search is applied in the database before pagination, including past 1,000 rows', async () => {
  const { request, calls } = setup({ result: { data: Array(50).fill({ id }), count: 1400 } });
  const response = await request('list', { search: 'billet 50%_off', offset: 1000 });
  assert.equal(response.data.total, 1400);
  assert.equal(response.data.hasMore, true);
  assert.deepEqual(calls.filter(c => c[0] === 'ilike'), [['ilike', 'search_text', '%billet%'], ['ilike', 'search_text', '%50\\%\\_off%']]);
  assert.deepEqual(calls.at(-1), ['range', 1000, 1049]);
});

test('invalid offsets and oversized searches are rejected', async () => {
  const { request, calls } = setup();
  for (const offset of [-1, 0.2, 'invalid']) assert.equal((await request('list', { offset })).code, 400);
  assert.equal((await request('list', { search: 'x'.repeat(201) })).code, 400);
  assert.deepEqual(calls, []);
});

test('create allows an optional description and preserves official URL query parameters', async () => {
  const { request, calls } = setup({ result: { data: { id } } });
  const url = 'https://merchant.example/ticket?event=42&category=adult';
  assert.equal((await request('save', { title: ' Aquarium ', source_url: url })).code, 201);
  const fields = calls.find(c => c[0] === 'insert')[1];
  assert.equal(fields.title, 'Aquarium');
  assert.equal(fields.description, '');
  assert.equal(fields.source_url, url);
});

test('invalid titles and dangerous or credential-bearing URLs cannot be saved', async () => {
  const { request, calls } = setup();
  for (const source_url of ['javascript:alert(1)', 'data:text/html,hello', 'ftp://merchant.example', 'https://user:pass@merchant.example', 'not a url']) {
    assert.equal((await request('save', { title: 'Test', source_url })).code, 400);
  }
  for (const title of ['', '   ', 'x'.repeat(201)]) assert.equal((await request('save', { title, source_url: 'https://example.org' })).code, 400);
  assert.deepEqual(calls, []);
});

test('editing only updates the selected record and reports a deleted record', async () => {
  const { request, calls } = setup({ result: { data: null } });
  assert.equal((await request('save', { id, title: 'Updated', source_url: 'https://example.org' })).code, 404);
  assert.ok(calls.some(c => c[0] === 'update'));
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'id' && c[2] === id));
});

test('delete validates and targets exactly one record', async () => {
  const { request, calls } = setup({ result: { data: { id } } });
  assert.equal((await request('delete', { id: 'invalid' })).code, 400);
  assert.deepEqual(calls, []);
  assert.equal((await request('delete', { id })).data.ok, true);
  assert.deepEqual(calls.find(c => c[0] === 'eq'), ['eq', 'id', id]);
});

test('missing database table produces an actionable setup error', async () => {
  const { request } = setup({ result: { error: { code: 'PGRST205' } } });
  const response = await request('list');
  assert.equal(response.code, 500);
  assert.match(response.data.error, /pas encore activé/);
});
