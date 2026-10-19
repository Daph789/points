import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChatMedia,registerChatMediaRoutes} from '../chat-media-server.js';
const gif='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
test('validates GIFs without flattening animation and rejects unsupported, forged and oversized media',()=>{
 assert.equal(validateChatMedia(gif).media_data_url,gif);
 assert.equal(validateChatMedia(gif).media_type,'image/gif');
 assert.equal(validateChatMedia(null),null);
 for(const value of ['https://example.org/file.gif','data:image/svg+xml;base64,PHN2Zz4=',gif.replace('image/gif','image/jpeg')])assert.throws(()=>validateChatMedia(value));
 assert.throws(()=>validateChatMedia('data:image/gif;base64,'+Buffer.alloc(3*1024*1024+1).toString('base64')),/chat_media_too_large/);
});
test('media retrieval requires membership and restricts side group rows',async()=>{
 for(const side of [false,true])for(const allowed of [false,true]){
  const routes=new Map();let filters={},queried=false;
  const q={select(){queried=true;return this},eq(k,v){filters[k]=v;return this},is(k,v){filters[k]=v;return this},in(k,v){filters[k]=v;return this},async maybeSingle(){return {data:{media_data_url:gif,media_type:'image/gif'}}}};
  registerChatMediaRoutes({get:(p,h)=>routes.set(p,h)},{supabaseAdmin:{from:()=>q},getAuthenticatedUser:async()=>({user:{id:'u'}}),ensureProfileForUser:async()=>({id:'u'}),getSocialPlanChatAccess:async()=>({allowed,plan:{id:'p'}}),getSideGroupAccess:async()=>({allowed,plan:{id:'p'},status:'waiting'}),getAcceptedSideMerge:async()=>null});
  const handler=[...routes.values()][side?1:0];let code=200,result;const res={status(c){code=c;return this},json(d){result=d;return this},set(){}};
  await handler({params:{id:'p',messageId:'m',status:'waiting'}},res);
  assert.equal(code,allowed?200:403);assert.equal(queried,allowed);
  if(allowed){assert.equal(filters.plan_id,'p');assert.equal(filters.deleted_at,null);assert.equal(result.data_url,gif);if(side)assert.deepEqual(filters.group_status,['waiting']);}
 }
});

test('both send routes accept image-only messages and retain metadata',async()=>{
 const {default:fs}=await import('node:fs');const {default:vm}=await import('node:vm');
 const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 for(const side of [false,true]){
  const path=side?'/api/social-plans/:id/side-group/:status/messages':'/api/social-plans/:id/chat';
  const start=source.indexOf(`app.post("${path}"`);const end=source.indexOf('\n});',start)+4;let handler,payload;
  const query={insert(value){payload=value;return this},select(){return this},async maybeSingle(){return {data:{id:'m',...payload}}}};
  const context={app:{post(p,h){handler=h}},supabaseAdmin:{from:()=>query},validateChatMedia,getAuthenticatedUser:async()=>({user:{id:'u'}}),ensureProfileForUser:async()=>({id:'u'}),getSocialPlanChatAccess:async()=>({allowed:true,plan:{id:'p'}}),getSideGroupAccess:async()=>({allowed:true,plan:{id:'p'},status:'waiting'}),getAcceptedSideMerge:async()=>null,normalizeMessageReplyId:()=>null,socialPlanMessageSelect:'*',sideGroupMessageSelect:'*',enrichPlanChatMessages:async x=>x,enrichSideMessages:async x=>x,console};
  vm.runInNewContext(source.slice(start,end),context);let result,code=200;
  await handler({params:{id:'p',status:'waiting'},body:{body:'',media_data_url:gif}},{status(c){code=c;return this},json(d){result=d;return this}});
  assert.equal(code,200);assert.equal(payload.media_type,'image/gif');assert.equal(payload.media_data_url,gif);assert.equal(payload.body,' ');assert.equal(result.message.id,'m');
 }
});
