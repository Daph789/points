import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('creation choices, photos, placeholders and save feedback translate for France and Belgium', () => {
 const storage=new Map();
 const context = {window:{},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},document:{addEventListener(){}}};
 vm.runInNewContext(read('donoss-i18n.js'),context);
 const i18n=context.window.donossI18n;
 const samples=["Te aceptaron en un plan","Sigues en lista de espera","Ya no estás en este plan","Actualización de plan","Aquí solo hablan las personas aceptadas y el creador del plan. Puedes ver participantes desde el icono superior.","Todavía no hay mensajes","Sé la primera persona en escribir al grupo.","Creado por","Miembro","Miembros","Miembros del chat","Participantes","Creador/a del plan","Participante aceptado","Chat del grupo","Entendido","Escribe un mensaje...","Respuesta a","Personas que reaccionaron","Lecturas","Visto por","Todavía nadie lo ha leído","Cuando alguien del grupo abra el chat, aparecerá aquí.","Modificar mensaje","¿Eliminar mensaje?","El mensaje desaparecerá del chat para mantener la conversación limpia.","Puedes modificarlo solo durante 15 minutos.","Modo Donoss: puedes moderar este mensaje sin aparecer como miembro.","Aquí ves la gente de tu mismo estado. Puedes chatear y, si hay otro grupo disponible, proponer unirlos.","Podéis veros, hablar y organizaros juntos sin entrar en el grupo principal.","Cargar mensajes anteriores","Responder","Ver quién lo ha leído","Mensaje","Usuario Donoss","Tus fotos de planes se compartirán solo con la persona que creó este plan y participantes autorizados.", "¿Cómo te calificas?", "Lo guardaremos para que la próxima participación sea más rápida. Puedes cambiarlo luego en Perfil.", "Chica", "Chico", "Mensaje opcional...", "Fecha necesaria", "Indica tu fecha de nacimiento", "Donoss calculará tu edad real para comprobar si puedes entrar en este grupo. La franja buscada no se muestra públicamente.", "Fotos necesarias", "Para participar, enseña quién eres", "Añade mínimo 2 fotos tuyas. Solo las verá la persona que creó el plan y la gente autorizada del mismo grupo.", "Añadir foto", "Listo para participar", "Si cancelas, no se enviará tu solicitud porque la otra persona no podrá reconocerte.", "Guardar y participar", "Tu solicitud está en espera. Cuando te acepten, podrás ver mejor a la gente del grupo y chatear.", "El administrador te ha retirado de este plan. Ya no puedes ver el grupo completo ni chatear.", "Aún no participas en este plan. Para ver los participantes y saber a qué se parecen, tienes que participar.", "Participantes y solicitudes", "Para apuntarte necesitas mínimo 2 fotos tuyas. Solo las verá la gente autorizada del plan.", "No se ha podido guardar tu edad.",'Fecha abierta','Ver grupo','Fotos de la persona','Fotos visibles solo para personas autorizadas','Tu plan','Aceptados','Caducado','Ver grupo alternativo','Estudiar','Pasear','Fotos tuyas para el plan','Título: Estudiar en la biblio...','Texto: quién eres, qué plan quieres, punto de encuentro...','Plan publicado correctamente.','Indica cuántas personas pueden apuntarse como máximo.'];
 for(const country of ['FR','BE']){i18n.setCountry(country);for(const sample of samples)assert.notEqual(i18n.text(sample),sample);}
 i18n.setCountry('ES');for(const sample of samples)assert.equal(i18n.text(sample),sample);
});
test('undated free plans do not expire, dated plans still expire',()=>{
 const source=read('server.js');const start=source.indexOf('function isSocialPlanExpired(');const end=source.indexOf('\nconst socialPlanSelect',start);
 const context=vm.createContext({todayDateString:()=> '2026-10-09',hasPastDate:()=>false});
 vm.runInContext(source.slice(start,end),context);
 assert.equal(context.isSocialPlanExpired({plan_type:'free',event_date:null}),false);
 assert.equal(context.isSocialPlanExpired({plan_type:'free',event_date:'2026-10-08'}),true);
 assert.equal(context.isSocialPlanExpired({plan_type:'free',event_date:'2026-10-10'}),false);
});

test('hashtag suggestions follow the selected country', () => {
 const source=read('plans.html');
 const start=source.indexOf('      function planHashtagsForCountry(');
 const end=source.indexOf('      function readPlanDraft()',start);
 const context=vm.createContext({});vm.runInContext(source.slice(start,end),context);
 for(const country of ['FR','BE']){
  const tags=context.planHashtagsForCountry(country);
  assert.ok(tags.includes('#etudier'));assert.ok(tags.includes('#photos'));
  assert.ok(!tags.includes('#estudiar'));assert.ok(!tags.includes('#donostia'));
  assert.ok(tags.includes(country==='FR'?'#lille':'#tournai'));
 }
 const tags=context.planHashtagsForCountry('ES');
 assert.ok(tags.includes('#estudiar'));assert.ok(!tags.includes('#lille'));assert.ok(!tags.includes('#tournai'));
});
