(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FourJTools=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_CENTS=99999999999;
  function money(value,label){
    const raw=String(value??'').trim();
    if(!raw)throw new Error('Preencha '+label+'. Use 0 apenas se esse valor for zero.');
    let normalized;
    if(/^\d+(?:,\d{1,2})?$/.test(raw))normalized=raw.replace(',','.');
    else if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw))normalized=raw.replace(/\./g,'').replace(',','.');
    else if(/^\d+\.\d{1,2}$/.test(raw))normalized=raw;
    else throw new Error('Confira '+label+': use um valor positivo ou zero, como 1.250,50, com até dois centavos.');
    const [whole,decimal='']=normalized.split('.');
    const cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));
    if(!Number.isSafeInteger(cents)||cents>MAX_CENTS)throw new Error('O valor de '+label+' é grande demais para esta simulação.');
    return cents;
  }
  function count(value){
    const raw=String(value??'').trim();
    if(!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>360)throw new Error('Informe de 1 a 360 parcelas, usando um número inteiro.');
    return Number(raw);
  }
  function budget(values){
    const income=money(values.income,'renda do mês');
    const bills=money(values.bills,'contas e parcelas');
    const daily=money(values.daily,'gastos do dia a dia');
    const goals=money(values.goals,'valor separado para objetivos');
    const planned=bills+daily+goals;
    return Object.freeze({income,bills,daily,goals,planned,margin:income-planned});
  }
  function goal(values){
    const target=money(values.target,'valor do objetivo');
    const saved=money(values.saved,'valor já guardado');
    const monthly=money(values.monthly,'contribuição mensal');
    if(target===0)throw new Error('O valor do objetivo precisa ser maior que zero.');
    const remaining=Math.max(0,target-saved);
    if(remaining>0&&monthly===0)throw new Error('Para calcular o prazo, informe uma contribuição mensal maior que zero.');
    const months=remaining?Math.ceil(remaining/monthly):0;
    const finalContribution=months?remaining-(months-1)*monthly:0;
    return Object.freeze({target,saved,monthly,remaining,months,finalContribution});
  }
  function installments(values){
    const cash=money(values.cash,'preço à vista');
    const down=money(values.down,'entrada');
    const payment=money(values.payment,'valor de cada parcela');
    const installments=count(values.installments);
    if(cash===0||payment===0)throw new Error('O preço à vista e o valor de cada parcela precisam ser maiores que zero.');
    const total=down+payment*installments;
    if(!Number.isSafeInteger(total))throw new Error('O total excede o limite desta simulação.');
    return Object.freeze({cash,down,payment,installments,total,difference:total-cash,differencePercent:100*(total-cash)/cash});
  }
  return Object.freeze({money,budget,goal,installments});
});
