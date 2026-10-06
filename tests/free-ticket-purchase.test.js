import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const routeSource = source.slice(source.indexOf('app.post("/api/purchases/offer"'), source.indexOf('app.get("/api/points/lookup"'));

async function buy(overrides = {}, { points = 0, body = {}, stockConflict = false } = {}) {
  const offer = { id: 'offer', business_id: 'merchant', is_free: true, required_points: 0, reduced_price: 0, receiver_transaction_id: 'MERCHANT1234', stock_quantity: 10, sold_count: 0, ...overrides };
  const inserted = [], transfers = [], updates = [], deleted = [];
  let handler;
  const supabaseAdmin = {
    auth: { getUser: async () => ({ data: { user: { id: 'buyer' } } }) },
    rpc: async (name, args) => { transfers.push(args); return { data: { sender_points: points - args.p_points } }; },
    from(table) {
      let action = 'select', payload;
      const query = {};
      for (const method of ['select', 'eq', 'is', 'order', 'limit']) query[method] = () => query;
      for (const method of ['insert', 'update', 'delete']) query[method] = value => { action = method; payload = value; return query; };
      query.maybeSingle = () => query;
      query.then = (resolve, reject) => {
        let data;
        if (action === 'insert') { inserted.push(payload); data = { id: 'ticket' }; }
        else if (action === 'update') { updates.push(payload); data = stockConflict ? null : { id: offer.id }; }
        else if (action === 'delete') { deleted.push(table); data = null; }
        else data = table === 'business_offers' ? offer : { id: 'merchant', transaction_id: 'MERCHANT1234', display_name: 'Merchant', points: 0 };
        return Promise.resolve({ data }).then(resolve, reject);
      };
      return query;
    },
  };
  const context = { app: { post: (path, fn) => { handler = fn; } }, supabaseAdmin, console,
    ensureProfileForUser: async () => ({ id: 'buyer', points }),
    safeHttpUrl: () => '', hasPastDate: () => false, cleanValidDonosId: v => v,
    todayDateString: () => '2026-10-06', generateTicketValidationCode: () => 'VALIDATION', generateTicketSecurityCode: () => 'SECURITY', randomUUID: () => 'qr-token',
  };
  vm.runInNewContext(routeSource, context);
  const response = { code: 200, status(value) { this.code = value; return this; }, json(data) { this.data = data; return this; } };
  await handler({ headers: { authorization: 'Bearer test' }, body: { offerId: offer.id, deliveryMethod: 'none', ...body } }, response);
  return { response, inserted, transfers, updates, deleted };
}

test('explicitly free ticket creates QR and consumes stock without moving points', async () => {
  const r = await buy();
  assert.equal(r.response.code, 200);
  assert.equal(r.response.data.total_points, 0);
  assert.equal(r.response.data.buyer_points, 0);
  assert.equal(r.inserted[0].qr_token, 'qr-token');
  assert.equal(r.inserted[0].validation_code, 'VALIDATION');
  assert.equal(r.updates[0].sold_count, 1);
  assert.equal(r.transfers.length, 0);
});

test('zero or negative prices without explicit free flag remain blocked, including forged client flag', async () => {
  for (const required_points of [0, -0, -10, null]) {
    const r = await buy({ is_free: false, required_points }, { body: { is_free: true } });
    assert.equal(r.response.code, 400);
    assert.equal(r.response.data.error, 'invalid_ticket_price');
    assert.equal(r.inserted.length, 0);
  }
});

test('paid tickets still transfer points and reject insufficient balances', async () => {
  const paid = { is_free: false, required_points: 407, reduced_price: 40.7 };
  const r = await buy(paid, { points: 500 });
  assert.equal(r.response.code, 200);
  assert.equal(r.transfers[0].p_points, 407);
  assert.equal(r.response.data.buyer_points, 93);
  const poor = await buy(paid);
  assert.equal(poor.response.data.error, 'insufficient_points');
  assert.equal(poor.inserted.length, 0);
});

test('free tickets retain stock, own-offer and hidden-offer restrictions', async () => {
  for (const [offer, expected] of [[{ sold_count: 10 }, 'out_of_stock'], [{ business_id: 'buyer' }, 'own_offer_not_allowed'], [{ is_hidden: true }, 'offer_hidden']]) {
    const r = await buy(offer);
    assert.equal(r.response.data.error, expected);
    assert.equal(r.inserted.length, 0);
  }
  const conflict = await buy({}, { stockConflict: true });
  assert.equal(conflict.response.data.error, 'out_of_stock');
  assert.equal(conflict.deleted.length, 1);
});

test('optional paid delivery on a free ticket keeps its existing charge', async () => {
  const r = await buy({ delivery_home_enabled: true, delivery_home_points: 20 }, { points: 50, body: { deliveryMethod: 'home', deliveryAddress: '10 rue du Test' } });
  assert.equal(r.response.code, 200);
  assert.equal(r.response.data.total_points, 20);
  assert.equal(r.transfers[0].p_points, 20);
});

test('link-only visibility does not block free or paid purchases', async () => {
  const free = await buy({ is_unlisted: true });
  assert.equal(free.response.code, 200);
  assert.equal(free.inserted[0].qr_token, 'qr-token');
  const paid = await buy({ is_unlisted: true, is_free: false, required_points: 50, reduced_price: 5 }, { points: 100 });
  assert.equal(paid.response.code, 200);
  assert.equal(paid.transfers[0].p_points, 50);
});
