import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('// Select lightweight candidates first;'), source.indexOf('function remainingOfferStock('));
const routes = source.slice(source.indexOf('app.get("/api/offers/featured"'), source.indexOf('app.get("/api/offers/by-category/'));
for (const endpoint of ['/api/offers/featured', '/api/offers/categories/summary']) {
  test(`${endpoint} fetches images only for chosen public local offers`, async () => {
    const offers = Array.from({ length: 250 }, (_, n) => ({ id: String(n), categories: [n % 2 ? 'Cine' : 'Libros'], country_code: n < 200 ? 'FR' : 'ES', is_unlisted: n === 0 }));
    const queries = [], handlers = new Map();
    const context = {
      app: { get: (path, fn) => handlers.set(path, fn) },
      publicOfferPreviewSelect: 'id, categories, cover_photo_data_url', legacyPublicOfferPreviewSelect: 'id, categories, cover_photo_data_url',
      getViewerMarket: async () => ({ country_code: 'FR' }),
      isOfferVisibleForPublic: offer => !offer.is_unlisted,
      filterItemsByMarket: items => items.filter(offer => offer.country_code === 'FR'),
      enrichOffersWithBusiness: async items => items,
      enrichOffersWithPromotions: async items => items,
      console,
      supabaseAdmin: { from() {
        let columns, ids;
        const q = { select(value) { columns = value; return q; }, order() { return q; }, limit() { return q; }, in(_, value) { ids = value;return q; }, then(resolve, reject) {
          queries.push({ columns, ids });
          return Promise.resolve({ data: ids ? ids.map(id => ({ id, cover_photo_data_url: `image:${id}` })) : offers }).then(resolve, reject);
        } };return q;
      } },
    };
    vm.createContext(context);vm.runInContext(helpers + routes, context);
    const response = { status() { return this; }, json(data) { this.data = data; } };
    await handlers.get(endpoint)({}, response);
    assert.ok(!queries[0].columns.includes('cover_photo_data_url'));
    assert.ok(queries[1].ids.length <= 9);
    assert.ok(!queries[1].ids.includes('0'));
    assert.ok(queries[1].ids.every(id => Number(id) < 200));
    if (endpoint.endsWith('featured')) { assert.equal(response.data.offers.length, 6);assert.ok(response.data.offers.every(offer => offer.cover_photo_data_url)); }
    else { assert.equal(response.data.total, 199);assert.equal(response.data.categories.find(c => c.category === 'Libros').count, 99); }
  });
}
