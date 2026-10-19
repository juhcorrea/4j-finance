'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runSandbox,requireTestMerchant}=require('./pix-sandbox.cjs');
const merchant={id:1234,site_id:'MLB',country_id:'BR',tags:['test_user']};
test('sandbox refuses real merchants and non-Brazilian accounts',()=>{
 for(const changed of [{tags:[]},{country_id:'AR'},{site_id:'MLA'},{id:null},{tags:undefined}])assert.throws(()=>requireTestMerchant({...merchant,...changed}));
 assert.equal(requireTestMerchant(merchant),'1234');
});
test('real token is rejected before any POST request',async()=>{
 const methods=[];
 await assert.rejects(runSandbox('synthetic-private-token',{fetchImpl:async(url,options)=>{methods.push(options.method);return{ok:true,json:async()=>({...merchant,tags:[]})};}}));
 assert.deepEqual(methods,['GET']);
});
test('sandbox confirms only a matching accredited Pix and never accesses Firebase',async()=>{
 const calls=[];let reference;
 const result=await runSandbox('synthetic-private-token',{fetchImpl:async(url,options)=>{
  calls.push({url,...options});assert.ok(url.startsWith('https://api.mercadopago.com/'));
  if(url.endsWith('/users/me'))return{ok:true,json:async()=>merchant};
  if(options.method==='POST'){const body=JSON.parse(options.body);reference=body.external_reference;assert.equal(body.total_amount,'5.00');assert.equal(body.payer.first_name,'APRO');assert.equal(body.processing_mode,'automatic');assert.ok(options.headers['X-Idempotency-Key']);return{ok:true,json:async()=>({id:'ORD00000000000000000000000001'})};}
  return{ok:true,json:async()=>({id:'ORD00000000000000000000000001',external_reference:reference,user_id:1234,country_code:'BRA',total_amount:'5.00',total_paid_amount:'5.00',status:'processed',status_detail:'accredited',integration_data:{application_id:'5678'},transactions:{payments:[{amount:'5.00',paid_amount:'5.00',status:'processed',status_detail:'accredited',payment_method:{id:'pix',type:'bank_transfer'}}]}})};
 }});
 assert.equal(result.approved,true);assert.equal(result.firebaseTouched,false);assert.equal(result.realChargeCreated,false);assert.equal(result.webhookVerified,false);assert.ok(!JSON.stringify(result).includes('synthetic-private-token'));assert.equal(calls.length,3);
});
test('provider error bodies are never exposed',async()=>{
 await assert.rejects(runSandbox('synthetic-private-token',{fetchImpl:async()=>({ok:false,status:401,json:async()=>({secret:'do-not-leak'})})}),e=>!e.message.includes('do-not-leak')&&e.message.includes('401'));
});
