import test from 'node:test';
import assert from 'node:assert/strict';
import { convertChatGif, registerChatGifRoutes } from '../chat-gif-server.js';
import { validateChatMedia } from '../chat-media-server.js';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('real animated GIF converts to a smaller MP4 accepted by chat validation', async () => {
 const dir=mkdtempSync(join(tmpdir(),'gif-test-'));
 try {
  const path=join(dir,'animated.gif');
  execFileSync(ffmpeg,['-loglevel','error','-f','lavfi','-i','testsrc=size=320x240:rate=20','-t','2',path]);
  const gif=readFileSync(path), result=await convertChatGif(gif);
  const media=validateChatMedia(result.url);
  assert.equal(media.media_type,'video/mp4');
  assert.ok(Buffer.from(result.url.split(',')[1],'base64').length < gif.length);
 } finally { rmSync(dir,{recursive:true,force:true}); }
});
test('rejects invalid and oversized source files', async () => {
 await assert.rejects(convertChatGif(Buffer.from('not a gif')),/invalid_chat_media/);
 const large=Buffer.alloc(20*1024*1024+1);large.write('GIF89a');
 await assert.rejects(convertChatGif(large),/chat_gif_too_large/);
});
test('both conversion routes check membership before reading the upload', async () => {
 const routes=[];
 registerChatGifRoutes({post:(...args)=>routes.push(args)}, {
  getAuthenticatedUser:async()=>({user:{id:'u'}}),ensureProfileForUser:async()=>({id:'u'}),
  getSocialPlanChatAccess:async()=>({allowed:false,reason:'denied'}),getSideGroupAccess:async()=>({allowed:false,reason:'denied'})
 },()=>{throw Error('must not parse');});
 for(const [,auth] of routes){let status;await auth({params:{id:'p',status:'waiting'}},{status(s){status=s;return this;},json(){}},()=>assert.fail('must not continue'));assert.equal(status,403);}
});
test('accepts GIF input above the old 3 MiB limit and rejects overlong animations without truncating silently', async () => {
 const small=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
 const result=await convertChatGif(Buffer.concat([small,Buffer.alloc(4*1024*1024)]));
 assert.equal(result.type,'video/mp4');
 const dir=mkdtempSync(join(tmpdir(),'gif-duration-test-'));
 try {
  const path=join(dir,'long.gif');
  execFileSync(ffmpeg,['-loglevel','error','-f','lavfi','-i','testsrc=size=16x16:rate=2','-t','63',path]);
  await assert.rejects(convertChatGif(readFileSync(path)),/chat_gif_too_long/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
