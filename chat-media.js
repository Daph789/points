(function () {
  const h = React.createElement;
  function text(fr, es) { return window.donossI18n?.getLocale?.() === 'fr' ? fr : es; }
  function errorText(code) {
    if (code === 'chat_media_too_large') return text('Le fichier est trop volumineux. Maximum : 3 Mo.', 'El archivo es demasiado grande. Máximo: 3 MB.');
    if (code === 'chat_media_sql_missing') return text('L’envoi d’images nécessite la mise à jour du chat. Réessaie après son activation.', 'El envío de imágenes requiere actualizar el chat. Inténtalo cuando esté activado.');
    return text('Impossible de charger cette image. Essaie un fichier JPG, PNG, WebP ou GIF.', 'No se puede cargar esta imagen. Prueba con un archivo JPG, PNG, WebP o GIF.');
  }
  function readFile(file) { return new Promise((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(file); }); }
  async function prepare(file) {
    if (!file) throw Error('invalid_chat_media');
    // Mobile file providers can omit or mislabel the MIME type. Inspect the bytes.
    const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
    const starts=(signature)=>signature.every((byte,index)=>bytes[index]===byte);
    const ascii=String.fromCharCode(...bytes);
    const type=/^GIF8[79]a/.test(ascii)?'image/gif'
      :starts([255,216,255])?'image/jpeg'
      :starts([137,80,78,71,13,10,26,10])?'image/png'
      :ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP'?'image/webp':'';
    if (!type) throw Error('invalid_chat_media');
    if (file.size > (type === 'image/gif' ? 3 : 20) * 1024 * 1024) throw Error('chat_media_too_large');
    const raw=await readFile(file);
    const url=`data:${type};base64,${raw.slice(raw.indexOf(',')+1)}`;
    if (type === 'image/gif') return {url, type};
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});
    const scale=Math.min(1,1600/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const result=canvas.toDataURL('image/jpeg',0.82);
    if (result.length > 4*1024*1024) throw Error('chat_media_too_large');
    return {url:result,type:'image/jpeg'};
  }
  function Picker({value,onChange,onError,disabled}) {
    const [busy,setBusy]=React.useState(false);
    const [error,setError]=React.useState('');
    async function choose(event) {
      const file=event.target.files?.[0];event.target.value='';if(!file)return;
      setBusy(true);setError('');try{onChange(await prepare(file));}catch(error){const message=errorText(error.message);setError(message);onError?.(message);}finally{setBusy(false);}
    }
    const input = React.useRef(null);
    return h('div',{className:'relative shrink-0'},
      error&&h('div',{role:'alert',className:'absolute bottom-full right-0 z-50 mb-3 w-64 rounded-2xl border border-red-400/30 bg-slate-900 p-3 text-sm text-red-300 shadow-xl'},error),
      h('input',{ref:input,type:'file',accept:'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif',disabled:disabled||busy,onChange:choose,hidden:true}),
      h('button',{type:'button',disabled:disabled||busy,onClick:()=>input.current?.click(),className:'grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-slate-300 hover:bg-white/10 disabled:opacity-50',title:text('Ajouter une photo ou un GIF','Añadir una foto o un GIF'),'aria-label':text('Ajouter une photo ou un GIF','Añadir una foto o un GIF'),'aria-busy':busy},
        h('svg',{width:24,height:24,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('rect',{x:3,y:3,width:18,height:18,rx:4}),h('circle',{cx:8.5,cy:8.5,r:1.5}),h('path',{d:'m21 15-5-5L5 21'}))));
  }
  function Preview({value,onChange,disabled}) {
    if (!value) return null;
    return h('div',{className:'mb-2 flex w-full items-center gap-3 rounded-2xl bg-white/5 p-2'},h('img',{src:value.url,alt:text('Aperçu avant envoi','Vista previa'),className:'h-24 w-24 rounded-xl object-contain'}),h('button',{type:'button',disabled,onClick:()=>onChange(null),className:'rounded-xl bg-white/10 px-4 py-2 text-sm text-white'},text('Retirer','Quitar')));
  }
  function Message({message,endpoint,token,userId}) {
    const [url,setUrl]=React.useState(message.local_media_url||'');const [failed,setFailed]=React.useState(false);const [expanded,setExpanded]=React.useState(false);
    React.useEffect(()=>{
      let alive=true;setFailed(false);
      if(message.local_media_url){setUrl(message.local_media_url);return;}
      setUrl('');if(!token||!userId||message.deleted_at)return;
      const cache=window.donossChatCache;const key=cache?.key(userId,`media:${endpoint}`);
      (async()=>{try{
        const cached=key?await cache.read(key):null;
        if(cached?.data_url){if(alive)setUrl(cached.data_url);return;}
        const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw Error();
        const data=await response.json();if(!/^data:image\/(jpeg|png|webp|gif);base64,/.test(data.data_url||''))throw Error();
        if(alive)setUrl(data.data_url);if(key)cache.write(key,{data_url:data.data_url});
      }catch(_){if(alive)setFailed(true);}})();return()=>{alive=false;};
    },[message.id,message.local_media_url,message.deleted_at,endpoint,token,userId]);
    if(!url)return h('div',{className:'my-2 rounded-xl bg-black/10 p-4 text-xs',role:'status'},failed?text('Image indisponible','Imagen no disponible'):text('Chargement de l’image…','Cargando imagen…'));
    return h(React.Fragment,null,h('button',{type:'button',onPointerDown:e=>e.stopPropagation(),onClick:e=>{e.stopPropagation();setExpanded(true);},className:'mt-2 block', 'aria-label':text('Agrandir l’image','Ampliar imagen')},h('img',{src:url,alt:message.media_type==='image/gif'?'GIF':text('Image du message','Imagen del mensaje'),className:'max-h-72 max-w-full rounded-2xl object-contain'})),expanded&&ReactDOM.createPortal(h('div',{className:'fixed inset-0 z-[100] grid place-items-center bg-black/95 p-5',role:'dialog','aria-modal':true,'aria-label':text('Image agrandie','Imagen ampliada'),onClick:()=>setExpanded(false)},h('button',{autoFocus:true,type:'button',onClick:()=>setExpanded(false),onKeyDown:e=>{if(e.key==='Escape')setExpanded(false);},className:'absolute right-4 top-4 rounded-full bg-white/20 px-5 py-3 text-white','aria-label':text('Fermer','Cerrar')},'×'),h('img',{src:url,alt:'',className:'max-h-[85dvh] max-w-full object-contain'})),document.body));
  }
  window.donossChatMedia={Picker,Preview,Message,errorText};
})();
