import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for(const file of ['plan-chat.html','side-group.html']){
 test(`${file} restores empty cache and refreshes hidden chat without marking read`,async()=>{
  const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const start=source.indexOf('        async function bootstrap()');
  const end=source.indexOf(file==='plan-chat.html'?'        async function loadChat(':'        async function loadGroup(',start);
  const snapshot={profile:{id:'u'},plan:{id:'p'},messages:[],has_more:false};
  let displayed=null,request=null,diskReads=0;
  const context={planId:'p',sideStatus:'waiting',startsPrefetched:true,initialCache:snapshot,cacheKeyRef:{current:null},cacheMetaRef:{current:null},supabaseClient:{auth:{getSession:async()=>({data:{session:{user:{id:'u'},access_token:'token'}}})}},window:{donossChatCache:{key:(user,chat)=>user+chat,peek:()=>snapshot,read:async()=>{diskReads++;return snapshot}},setTimeout(){}},setToken(){},setMessages:rows=>displayed=rows,setPlan(){},setProfile(){},setMembers(){},setHasMoreMessages(){},setStatus(){},scrollChatToBottom(){},redirectToLogin(){throw Error('Unexpected login')},loadChat:async(...args)=>request=args,loadGroup:async(...args)=>request=args};
  vm.runInNewContext(source.slice(start,end),context);await context.bootstrap();
  assert.equal(displayed.length,0);assert.equal(diskReads,0);assert.equal(request[0],'token');assert.equal(request[2].markRead,false);assert.equal(context.cacheMetaRef.current.plan.id,'p');
 });
}
