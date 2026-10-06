import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../plans.html', import.meta.url), 'utf8');
const mark = source.slice(source.indexOf('        async function markNotificationsRead(keys)'), source.indexOf('        async function markQuedarSubsectionRead'));
const load = source.slice(source.indexOf('        async function loadNotifications('), source.indexOf('        async function loadPlans('));
function setup(ok) {
  let readKeys = new Set(), toast, writes = 0;
  const events = [];
  const context = {
    token: 'token', confirmedReadKeysRef: { current: new Set() }, pendingReadKeysRef: { current: new Set() },
    setReadKeys: value => { readKeys = typeof value === 'function' ? value(readKeys) : value; },
    setNotificationEvents() {}, setNotificationCounts() {}, authHeaders: () => ({}),
    setActionToast: value => { toast = value; }, i18n: { getLocale: () => 'fr' }, console,
    CustomEvent: class { constructor(type) { this.type = type; } },
    window: { dispatchEvent: event => events.push(event.type), parent: { postMessage: event => events.push(event.type) }, location: { origin: 'http://test' } },
    fetch: async (url, options) => {
      if (options.method === 'POST') { writes++; return { ok }; }
      // Deliberately return stale unread data, as an overlapping poll could do.
      return { ok: true, json: async () => ({ events: [{ key: 'old', read: false }, { key: 'new', read: false }] }) };
    },
  };
  vm.createContext(context);vm.runInContext(load + mark, context);
  return { context, keys: () => readKeys, toast: () => toast, writes: () => writes, events };
}

test('read stays cleared after stale polling, but a new event stays unread', async () => {
  const s = setup(true);
  await s.context.markNotificationsRead(['old']);
  await s.context.loadNotifications();
  assert.equal(s.keys().has('old'), true);
  assert.equal(s.keys().has('new'), false);
  assert.equal(s.events.length, 2);
  await s.context.markNotificationsRead(['old']);
  assert.equal(s.writes(), 1);
});

test('failed read restores badge, explains failure and permits retry', async () => {
  const s = setup(false);
  await s.context.markNotificationsRead(['old']);
  assert.equal(s.keys().has('old'), false);
  assert.equal(s.toast().type, 'error');
  assert.equal(s.context.pendingReadKeysRef.current.size, 0);
  assert.equal(s.events.length, 0);
  await s.context.markNotificationsRead(['old']);
  assert.equal(s.writes(), 2);
});

test('zero unread count never falls back to old server totals', () => {
  const code = source.slice(source.indexOf('        function unreadCount('), source.indexOf('        function chatUnreadEventsForPlan'));
  const context = { unreadEventsFor: () => [], notificationCounts: { subsections: { 'quedar:mine': 4 } } };
  vm.createContext(context);vm.runInContext(code, context);
  assert.equal(context.unreadCount('mine'), 0);
});
