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
 const samples=['Estudiar','Pasear','Fotos tuyas para el plan','Título: Estudiar en la biblio...','Texto: quién eres, qué plan quieres, punto de encuentro...','Plan publicado correctamente.','Indica cuántas personas pueden apuntarse como máximo.'];
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
