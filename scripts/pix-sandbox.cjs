'use strict';
// Test-only helper. The token arrives through stdin and is never written to a file.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const API='https://api.mercadopago.com';
function requireTestMerchant(me){
 if(!me||!Number.isSafeInteger(Number(me.id))||Number(me.id)<=0||me.site_id!=='MLB'||me.country_id!=='BR'||!Array.isArray(me.tags)||!me.tags.includes('test_user'))throw Error('A credencial precisa pertencer a um vendedor de TESTE do Brasil. Nenhuma cobrança foi criada.');
 return String(me.id);
}
async function runSandbox(token,{fetchImpl=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=12}={}){
 if(typeof token!=='string'||token.trim().length<20||/[\r\n]/.test(token.trim()))throw Error('Credencial de teste ausente ou inválida.');
 async function request(endpoint,body,key){
  const response=await fetchImpl(API+endpoint,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token.trim(),'Content-Type':'application/json',...(key?{'X-Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error('O Mercado Pago recusou a consulta (HTTP '+response.status+'). O conteúdo privado da resposta foi omitido.');
  return response.json();
 }
 const merchantId=requireTestMerchant(await request('/users/me'));
 const intent=randomUUID(),reference='4j_test_'+intent.replace(/-/g,'');
 const body={type:'online',total_amount:'5.00',external_reference:reference,processing_mode:'automatic',payer:{email:'test@testuser.com',first_name:'APRO'},transactions:{payments:[{amount:'5.00',payment_method:{id:'pix',type:'bank_transfer'},expiration_time:'PT24H'}]}};
 let order=await request('/v1/orders',body,intent);
 if(!/^ORD[A-Z0-9]{10,60}$/.test(String(order.id||'')))throw Error('A API não devolveu uma identificação de order válida.');
 const providerId=order.id;let approved=false;
 for(let attempt=0;attempt<attempts;attempt++){
  if(attempt)await wait(3000);
  order=await request('/v1/orders/'+providerId);
  if(order.id!==providerId||order.external_reference!==reference||String(order.user_id)!==merchantId||order.country_code!=='BRA'||Number(order.total_amount)!==5)throw Error('O retorno da order não corresponde ao teste criado.');
  const payments=order.transactions?.payments;
  if(order.status==='processed'&&order.status_detail==='accredited'){
   if(!Array.isArray(payments)||payments.length!==1||payments[0].payment_method?.id!=='pix'||payments[0].payment_method?.type!=='bank_transfer'||Number(payments[0].amount)!==5||Number(order.total_paid_amount)!==5||Number(payments[0].paid_amount)!==5||payments[0].status!=='processed'||payments[0].status_detail!=='accredited')throw Error('A order ainda não confirmou todos os dados do Pix de teste.');
   approved=true;break;
  }
  if(['failed','canceled','expired','refunded','charged_back'].includes(order.status))break;
 }
 return {testedAt:new Date().toISOString(),provider:'Mercado Pago Orders',environment:'test',amount:5,currency:'BRL',approved,orderId:providerId,merchantId,applicationId:String(order.integration_data?.application_id||''),providerStatus:order.status,providerDetail:order.status_detail,firebaseTouched:false,realChargeCreated:false,webhookVerified:false};
}
async function main(){
 if(process.argv[2]!=='--stdin')throw Error('Execute pelo testar-pix.ps1. Não informe tokens nos argumentos do terminal.');
 let token='';for await(const chunk of process.stdin){token+=chunk;if(token.length>8192)throw Error('Entrada inválida.');}
 try{
  const report=await runSandbox(token);
  const folder=path.resolve(__dirname,'../work/pix-sandbox');fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'resultado.json'),JSON.stringify(report,null,2)+'\n');
  console.log(report.approved?'Teste Pix de R$ 5 aprovado pela API Orders. Nenhum dinheiro real movimentado.':'Order de teste criada; a confirmação não chegou no tempo desta consulta.');
  console.log('Resultado sem credenciais salvo em work/pix-sandbox/resultado.json.');
  console.log('Este teste não valida o webhook nem libera o benefício de nenhuma conta Firebase.');
 }finally{token='';}
}
module.exports={requireTestMerchant,runSandbox};
if(require.main===module)main().catch(error=>{console.error(error.message?.startsWith('A ')||error.message?.startsWith('O ')||error.message?.startsWith('Execute')||error.message?.startsWith('Credencial')?error.message:'Não foi possível concluir o teste; nenhum detalhe privado foi impresso.');process.exitCode=1;});
