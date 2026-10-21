import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for (const page of ['plan-chat.html', 'side-group.html']) {
  test(`${page}: confirmation and refresh retain the image and caption; deletion clears image`, () => {
    const source = fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const merge = vm.runInNewContext('(' + source.slice(source.indexOf('function mergeMessagesWithPending('), source.indexOf('function prependOlderMessages(')).trim() + ')');
    const item = { id: 'temp-1', local_media_url: 'data:image/gif;base64,example', body: 'Bonjour', pending: true };
    const message = { id: 'saved-1', body: 'Bonjour', media_type: 'image/gif' };
    const expression = source.match(/\{ \.\.\.data\.message, local_media_url: preparedAttachment\?\.url \|\| null, local_key: (?:temporaryId|tempId), local_confirmed_at: new Date\(\)\.toISOString\(\) \}/)?.[0];
    assert.ok(expression);
    const confirmed = vm.runInNewContext(`(${expression})`, { preparedAttachment: {url:item.local_media_url}, item, data: { message }, temporaryId: item.id, tempId: item.id });
    assert.equal(confirmed.local_media_url, item.local_media_url);
    assert.equal(confirmed.body, item.body);
    assert.equal(confirmed.pending, undefined);
    const refreshed = merge([message], [confirmed]);
    assert.equal(refreshed.length, 1);
    assert.equal(refreshed[0].local_media_url, item.local_media_url);
    assert.equal(refreshed[0].local_key, item.id);
    assert.equal(refreshed[0].body, item.body);
    assert.equal(merge([{ ...message, deleted_at: 'now', media_type: null }], refreshed)[0].local_media_url, null);
  });
}
