import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for(const file of ['plan-chat.html','side-group.html']) for(const failure of [false,true]) {
 test(file+' queued conversion '+(failure?'failure':'success'),async()=>{
  const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const start=source.indexOf('async function sendMessage('),end=source.indexOf('async function saveEditedMessage',start);
  let finish,fail;
  const ready=new Promise((a,b)=>{finish=a;fail=b;});
  const attachment={url:'blob:preview',type:'image/gif',ready};
  let messages=[],calls=0,status='',restored;
  const noop=()=>{};
  const context={draft:'caption',attachment,isSending:false,isSaving:false,replyingTo:null,profile:{id:'u'},planId:'p',sideStatus:'waiting',token:'t',
    setIsSending:noop,setIsSaving:noop,setDraft:noop,setAttachment:v=>restored=v,setReplyingTo:noop,
    forceScrollRef:{},setMessages:fn=>messages=fn(messages),setStatus:v=>status=v,
    URL:{revokeObjectURL:noop},window:{setTimeout:noop,donossChatMedia:{errorText:x=>x}},friendlyChatError:x=>x,
    fetch:async(_url,options)=>{calls++;assert.equal(JSON.parse(options.body).media_data_url,'data:video/mp4;base64,converted');return {ok:true,json:async()=>({message:{id:'server',body:'caption',media_type:'video/mp4'}})}}
  };
  const send=vm.runInNewContext('('+source.slice(start,end).trim()+')',context);
  const task=send({preventDefault:noop});
  assert.equal(messages.length,1);assert.equal(messages[0].pending,true);
  assert.equal(messages[0].body,'caption');assert.equal(messages[0].local_media_url,'blob:preview');
  assert.equal(calls,0);assert.equal(attachment.claimed,true);
  if(failure)fail(Error('chat_gif_conversion_failed'));else finish({url:'data:video/mp4;base64,converted',type:'video/mp4'});
  await task;
  assert.equal(calls,failure?0:1);
  if(failure){assert.equal(messages.length,0);assert.equal(restored,null);assert.equal(status,'chat_gif_conversion_failed');}
  else {assert.equal(messages[0].id,'server');assert.equal(messages[0].body,'caption');assert.equal(messages[0].local_media_url,'data:video/mp4;base64,converted');}
 });
}
