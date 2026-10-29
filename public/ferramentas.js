(function(){
  'use strict';
  const core=window.FourJTools;
  if(!core)return;
  const currency=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  const integer=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
  const percent=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
  const brl=value=>currency.format(value/100);
  const examples={budget:{income:'3.000,00',bills:'1.650,00',daily:'850,00',goals:'300,00'},goal:{target:'1.200,00',saved:'250,00',monthly:'150,00'},installments:{cash:'900,00',down:'100,00',payment:'90,00',installments:'10'}};
  function text(parent,tag,value,className){const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;parent.append(el);return el;}
  function line(parent,label,value){const row=document.createElement('div');row.className='tool-result-line';text(row,'span',label);text(row,'strong',value);parent.append(row);}
  function renderResult(kind,result,output){
    if(kind==='budget'){
      text(output,'p',result.margin<0?'O plano ultrapassa a renda':result.margin===0?'O plano ocupa toda a renda':'Diferença depois do seu plano','result-eyebrow');
      text(output,'h3',brl(result.margin),'result-value');
      line(output,'Renda considerada',brl(result.income));
      line(output,'Contas + dia a dia + objetivos',brl(result.planned));
      text(output,'p',result.margin<0?'Faltam '+brl(-result.margin)+' para cobrir o que você informou. Confira valores e escolha o que pode ser renegociado, adiado ou ajustado.':result.margin===0?'Tudo o que entrou no cálculo já tem destino. Uma despesa que ficou de fora muda esse resultado.':'Essa diferença não é uma autorização de compra. Confira contas esquecidas, vencimentos e imprevistos antes de usar o valor.','result-guidance');
    }else if(kind==='goal'){
      text(output,'p',result.months?'Um passo por mês':'Objetivo alcançado no cálculo','result-eyebrow');
      text(output,'h3',result.months?integer.format(result.months)+' '+(result.months===1?'contribuição mensal':'contribuições mensais'):'Você já guardou o valor do objetivo','result-value');
      line(output,'Ainda falta',brl(result.remaining));
      if(result.months){line(output,'Contribuição mensal planejada',brl(result.monthly));line(output,'Última contribuição necessária',brl(result.finalContribution));}
      text(output,'p',result.months?'O cálculo começa no valor já guardado e soma uma contribuição por mês, sem rendimentos, inflação ou retiradas. Se o preço do objetivo ou a contribuição mudar, recalcule.':'Confira se o valor guardado está reservado para esse objetivo e se o preço continua atualizado.','result-guidance');
    }else{
      text(output,'p','Custo total do parcelamento','result-eyebrow');
      text(output,'h3',brl(result.total),'result-value');
      line(output,'Entrada',brl(result.down));
      line(output,integer.format(result.installments)+' parcelas de '+brl(result.payment),brl(result.payment*result.installments));
      line(output,'Preço à vista',brl(result.cash));
      const difference=result.difference===0?'Mesmo total do preço à vista':brl(Math.abs(result.difference))+(result.difference>0?' a mais':' a menos')+' ('+percent.format(Math.abs(result.differencePercent))+'%)';
      text(output,'p',difference,'result-comparison');
      text(output,'p','A porcentagem compara os dois preços; não é uma taxa de juros nem o CET. Inclua encargos no valor das parcelas e confira os vencimentos. Um preço menor pode continuar sem caber no orçamento.','result-guidance');
    }
  }
  document.querySelectorAll('[data-tool]').forEach(form=>{
    const kind=form.dataset.tool;
    const output=document.getElementById(kind+'-result');
    const error=form.querySelector('.tool-error');
    const status=form.querySelector('.tool-input-status');
    function clearResult(){output.hidden=true;output.replaceChildren();error.textContent='';error.hidden=true;form.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));}
    form.addEventListener('input',()=>{clearResult();status.textContent='Valores alterados. Calcule novamente para atualizar o resultado.';});
    form.querySelector('[data-example]').addEventListener('click',()=>{
      clearResult();for(const [name,value]of Object.entries(examples[kind]))form.elements.namedItem(name).value=value;
      status.textContent='Exemplo fictício carregado. Você pode editar os valores antes de calcular.';
      form.querySelector('input').focus();
    });
    form.addEventListener('reset',()=>{clearResult();status.textContent='Campos limpos. Nenhum valor ficou salvo nesta ferramenta.';});
    form.addEventListener('submit',event=>{
      event.preventDefault();clearResult();
      const values=Object.fromEntries(new FormData(form));
      try{
        const result=core[kind](values);renderResult(kind,result,output);output.hidden=false;status.textContent='';output.focus();
      }catch(problem){
        error.textContent=problem.message;error.hidden=false;error.focus();
      }
    });
    form.querySelector('[data-tool-controls]').disabled=false;
  });
})();
