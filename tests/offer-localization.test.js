import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
function setup(country) {
  const storage = new Map();
  const context = { window: {}, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, document: { addEventListener() {} } };
  vm.runInNewContext(fs.readFileSync(new URL('donoss-i18n.js', root), 'utf8'), context);
  context.window.donossI18n.setCountry(country);
  return context.window.donossI18n;
}
const samples = [
  ['Fecha única para reservar', 'Date unique de réservation'],
  ['El cliente solo podrá reservar para 2026-10-18.', 'Le client pourra uniquement réserver pour 2026-10-18.'],
  ['2 personas = 464 ptos. si el billete vale 232 ptos.', '2 personnes = 464 points si le billet coûte 232 points.'],
  ['A pagar', 'À payer'], ['Cuenta que recibe los puntos', 'Compte qui reçoit les points'],
  ['Ej. Lunes a viernes, 17:00-22:00', 'Ex. Du lundi au vendredi, 17 h–22 h'],
  ['No tienes puntos suficientes para completar esta compra.', 'Tu n’as pas assez de points pour finaliser cet achat.'],
  ['No puedes comprar tu propia publicación porque los puntos volverían a tu misma cuenta.', 'Tu ne peux pas acheter ta propre publication, car les points reviendraient sur ton compte.'],
];
for (const country of ['FR', 'BE', 'ES']) {
  test(`publication and payment text follows country ${country}`, () => {
    const i18n = setup(country);
    for (const [es, fr] of samples) assert.equal(i18n.text(es), country === 'ES' ? es : fr);
  });
}
test('multiline JSX text translates as a complete sentence', () => {
  const i18n = setup('FR');
  assert.equal(i18n.text('  Por defecto se multiplica el precio del billete\n     por cada persona de la reserva.  ').trim(), 'Par défaut, le prix du billet est multiplié par le nombre de personnes de la réservation.');
});
test('literal UI text in the four pages has French coverage', () => {
  const i18n = setup('FR');
  const unchanged = new Set(['Donoss', 'Total', '×', 'ID', 'QR']);
  for (const file of ['admin-offer.html', 'offer-detail.html', 'checkout.html', 'my-offers.html']) {
    const source = fs.readFileSync(new URL(file, root), 'utf8');
    for (const match of source.matchAll(/>([^<>{}]+)</g)) {
      const text = match[1].trim().replace(/\s+/g, ' ');
      if (!text || !/[A-Za-zÀ-ÿ]/.test(text) || /[=;]|function|const |return|\.html|\/gi|current\.length/.test(text) || unchanged.has(text)) continue;
      assert.notEqual(i18n.text(text), text, `${file}: ${text}`);
    }
  }
});
