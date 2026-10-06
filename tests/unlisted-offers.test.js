import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const visibility = source.slice(source.indexOf('function remainingOfferStock('), source.indexOf('async function getViewerMarket('));

test('public lists exclude link-only offers and preserve existing stock/expiry rules', () => {
  const context = { hasPastDate: date => date === 'expired' };
  vm.createContext(context);vm.runInContext(visibility, context);
  const visible = context.isOfferVisibleForPublic;
  assert.equal(visible({}), true);
  assert.equal(visible({ is_unlisted: false }), true);
  assert.equal(visible({ is_unlisted: true }), false);
  assert.equal(visible({ is_hidden: true }), false);
  assert.equal(visible({ end_date: 'expired' }), false);
  assert.equal(visible({ stock_quantity: 1, sold_count: 1, out_of_stock_since: '2020-01-01' }), false);
});

test('direct link still loads an unlisted offer for a non-owner', async () => {
  const start = source.indexOf('app.get("/api/offers/:offerId"');
  const end = source.indexOf('\napp.', start + 1);
  let handler;
  const offer = { id: 'ticket', is_unlisted: true, is_hidden: false, business_id: 'merchant' };
  const chain = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: offer }) };
  const context = { app: { get: (_, fn) => { handler = fn; } }, supabaseAdmin: { from: () => chain }, publicOfferPreviewSelect: '', publicOfferSelect: '', hasPastDate: () => false, enrichOffersWithBusiness: async items => items, console };
  vm.createContext(context);vm.runInContext(source.slice(start, end), context);
  const response = { code: 200, status(code) { this.code = code;return this; }, json(data) { this.data = data;return this; } };
  await handler({ params: { offerId: 'ticket' }, headers: {}, query: {} }, response);
  assert.equal(response.code, 200);
  assert.equal(response.data.offer.id, 'ticket');
  offer.is_hidden = true;
  await handler({ params: { offerId: 'ticket' }, headers: {}, query: {} }, response);
  assert.equal(response.code, 404);
});
