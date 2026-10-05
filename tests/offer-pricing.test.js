import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function formatter(locale) {
  const context = { window: { donossI18n: { getLocale: () => locale } } };
  vm.runInNewContext(fs.readFileSync(new URL('../offer-pricing.js', import.meta.url), 'utf8'), context);
  return context.window.donossPricing.formatDiscount;
}

for (const locale of ['fr', 'es']) {
  test(`accurate reductions and price validation (${locale})`, () => {
    const discount = formatter(locale);
    assert.equal(discount(40.90, 40.70), '−0,49 %');
    assert.equal(discount('40.90', '40.70'), '−0,49 %');
    assert.equal(discount(10, 5), '−50 %');
    assert.equal(discount(3, 2), '−33,33 %');
    assert.equal(discount(1000, 999.99), '< 0,01 %');
    assert.equal(discount(1000, 0.01), '−99,99 %');
    assert.equal(discount(20, 0), '−100 %');
    for (const pair of [[10, 10], [10, 11], [0, 0], [-5, 1], [10, -1], [null, 2], [10, null], [10, ''], [10, 'bad'], [Infinity, 2], [true, 0]]) {
      assert.equal(discount(...pair), null, JSON.stringify(pair));
    }
  });
}

test('every existing discount display uses the shared formatter', () => {
  for (const page of ['home', 'category', 'offer-detail', 'business-profile', 'my-offers', 'historial']) {
    const html = fs.readFileSync(new URL(`../${page}.html`, import.meta.url), 'utf8');
    assert.ok(html.includes('src="offer-pricing.js"'), page);
    assert.ok(html.includes('window.donossPricing.formatDiscount'), page);
    assert.ok(!/-\{discount(?:Percent)?\}%/.test(html), page);
  }
});
