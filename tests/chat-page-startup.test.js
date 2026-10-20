import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
for (const file of ['plan-chat.html','side-group.html']) {
 test(`${file} loads translations before rendering and has a pre-React placeholder`,()=>{
  const html=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const i18n=html.indexOf('<script src="donoss-i18n.js"></script>');
  assert.ok(i18n>=0 && i18n<html.indexOf('<script type="text/babel">'));
  assert.match(html,/<div id="root"><div aria-busy="true"/);
  assert.ok(html.includes('!plan && !status'));
 });
}
