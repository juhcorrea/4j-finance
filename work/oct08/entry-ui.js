function expenseMode(record){return Recurrence.is(record)?'monthly':Number(record?.parcelas)>1?'installments':'once';}
function entriesPage(){
  const expense=state.type==='despesa',r=state.editId?Store.data[expense?'despesas':'receitas'].find(x=>x.id===state.editId):null,mode=expenseMode(r);
  const cats=[...(expense?expenseCats:incomeCats),...(Store.meta[expense?'customCatDespesa':'customCatReceita']||[])];
  const modes=[['once','Uma vez','Uma conta ou compra'],['installments','Parcelada','Uma compra em parcelas'],['monthly','Todo mês','Uma despesa recorrente']];
  return `${pageTop(state.editId?'Vamos ajustar este lançamento.':'Um registro. Mais tranquilidade.','Registre hoje, mesmo que a compra tenha sido feita antes.',`<button class="button secondary" data-action="import">${icon('upload')} Importar extrato</button>`)}<div class="entry-layout"><section class="card"><form id="entry-form" class="entry-form">
    <div class="segmented" role="group" aria-label="Tipo de lançamento"><button type="button" data-action="entry-type" data-type="despesa" class="expense ${expense?'active':''}" aria-pressed="${expense}">${icon('expense')} Despesa</button><button type="button" data-action="entry-type" data-type="receita" class="income ${expense?'':'active'}" aria-pressed="${!expense}">${icon('income')} Receita</button></div>
    ${expense?`<fieldset class="expense-frequency"><legend>Como essa despesa acontece?</legend>${r?`<input type="hidden" name="expenseMode" value="${mode}"><div class="schedule-fixed"><b>${modes.find(m=>m[0]===mode)[1]}</b><span>O tipo do lançamento é mantido para preservar seu histórico.</span></div>`:`<div class="frequency-options">${modes.map(([key,title,note])=>`<label><input type="radio" name="expenseMode" value="${key}" ${mode===key?'checked':''}><span><b>${title}</b><small>${note}</small></span></label>`).join('')}</div>`}</fieldset>`:''}
    <label class="amount-field"><b id="amount-label">${expense?'Quanto você gastou?':'Quanto você recebeu?'}</b><span>R$</span><input id="entry-amount" name="amount" inputmode="decimal" required maxlength="16" autocomplete="off" placeholder="0,00" value="${r?Number(r.valor).toFixed(2).replace('.',','):''}" aria-describedby="amount-note"></label><small id="amount-note" class="muted">${expense?'Informe o valor da despesa.':'Informe o valor que entrou.'}</small>
    <div class="field-grid"><label class="span2">${expense?'Com o que você gastou?':'De onde veio esse dinheiro?'}<input id="entry-desc" name="description" required maxlength="150" placeholder="${expense?'Ex.: plano VIVO, supermercado...':'Ex.: salário, trabalho extra...'}" value="${esc(r?.desc||'')}"></label>
    ${expense?`<label id="purchase-date-field">Data da compra <small>Opcional · pode ser de um mês anterior</small><input name="purchaseDate" id="purchase-date" type="date" value="${esc(r?.purchaseDate||'')}"></label>`:''}
    <label><span id="due-date-label">${expense?'Pagamento ou vencimento':'Data do recebimento'}</span><input name="date" id="entry-date" type="date" required value="${esc(r?.data||Money.today())}"><small id="due-date-note">${expense?'É esta data que define o mês do relatório.':''}</small></label>
    <label>Categoria<select name="category" id="entry-category">${options(cats,r?.cat||cats[0])}<option value="__new">+ Nova categoria</option></select></label>
    ${expense?`<label>Forma de pagamento<select name="payment">${options([...payments,...(Store.meta.customFormaPg||[])],r?.forma||'Pix')}</select></label><label id="entry-paid-field"><span id="entry-paid-label">Pagamento</span><select name="paid"><option value="0" ${!r?.jaPagas?'selected':''}>Ainda vou pagar</option><option value="1" ${r?.jaPagas?'selected':''}>Já foi pago</option></select></label>`:''}</div>
    ${expense?`<section id="installment-fields" class="schedule-fields" ${mode!=='installments'?'hidden':''}><h3>Parcelas da compra</h3><p>Informe a primeira parcela, mesmo que ela tenha vencido há meses. Não é preciso mudar o mês da página para cadastrar.</p><div class="field-grid"><label>Em quantas parcelas?<input name="installments" type="number" min="2" max="600" step="1" value="${Math.min(600,Math.max(2,parseInt(r?.parcelas)||2))}" required></label><label>Quantas já foram pagas?<input name="paidInstallments" type="number" min="0" max="600" step="1" value="${Math.max(0,parseInt(r?.jaPagas)||0)}" required><small>Contando desde a primeira parcela.</small></label></div></section>
    <section id="recurrence-fields" class="schedule-fields" ${mode!=='monthly'?'hidden':''}><h3>Repete todos os meses</h3><p>Cadastre uma vez. A cobrança aparece automaticamente nos meses seguintes, sempre com o valor mensal informado.</p><div class="field-grid"><label>Até quando repetir?<select name="recurrenceEnd"><option value="never" ${!r?.recurrence?.until?'selected':''}>Sem data para terminar</option><option value="until" ${r?.recurrence?.until?'selected':''}>Até um mês específico</option></select></label><label id="recurrence-until-field">Último mês da cobrança<input type="month" name="recurrenceUntil" value="${esc(r?.recurrence?.until||'')}" required><small>Inclui a cobrança deste mês.</small></label></div>${r?'<p class="form-tip">Os pagamentos são marcados por mês em Relatórios. Alterar valor ou vencimento atualiza toda a série, inclusive os meses anteriores. Para encerrar sem apagar o histórico, defina o último mês.</p>':'<p class="form-tip">As próximas mensalidades ficam a pagar. Você confirma cada pagamento nos relatórios.</p>'}</section>
    <div id="schedule-preview" class="schedule-preview" role="status" aria-live="polite" hidden></div>
    <details class="reimbursement-options"><summary>Reembolso</summary><label class="checkbox"><input type="checkbox" name="reimbursable" ${r?.reembolsavel?'checked':''}> A empresa vai me reembolsar</label>${r?.reembolsavel?`<label class="checkbox"><input type="checkbox" name="reimbursed" ${r.reembolsado?'checked':''}> Já recebi o reembolso</label>`:''}</details>`:''}
    <p id="entry-error" class="form-error" role="alert" hidden></p><button class="button primary full" type="submit" ${!Store.editable?'disabled':''}>${icon('check')} ${state.editId?'Salvar alterações':expense?'Salvar despesa':'Salvar receita'}</button>${state.editId?'<button class="text-button" type="button" data-action="cancel-edit">Cancelar edição</button>':''}<p class="form-tip">${Store.demo?'Demonstração: as mudanças somem ao recarregar.':Store.editable?'O lançamento será salvo na conta da sua família.':'Seu acesso a este perfil é somente leitura.'}</p></form></section>
    <aside class="entry-side"><div class="gentle-tip"><img src="${CATATAU_IMAGE}" alt="Catatau"><div><h3>Seu histórico também cabe aqui.</h3><p>Comprou antes de começar a usar o 4J? Escolha Parcelada, informe as datas originais e quantas parcelas já pagou. Eu organizo os meses para você.</p><button class="text-button" data-action="catatau">Preciso de uma ajuda</button></div></div><section class="card"><div class="card-head"><div><h2>Seus últimos registros</h2><p>Receitas e despesas de ${esc(monthName(state.month))}</p></div></div>${monthRows().length?monthRows().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(r=>transaction(r,true)).join(''):empty('Pode começar por aqui','O primeiro registro aparece assim que você salvar.')}<a class="text-button" href="#relatorios">Consultar todos os lançamentos</a></section></aside></div>`;
}
function syncEntrySchedule(){
  const form=$('#entry-form');if(!form||state.type!=='despesa')return;
  const mode=new FormData(form).get('expenseMode')||'once',monthly=mode==='monthly',installments=mode==='installments';
  const section=(id,visible)=>{const el=$(id);el.hidden=!visible;el.querySelectorAll('input,select').forEach(input=>input.disabled=!visible);};
  section('#installment-fields',installments);section('#recurrence-fields',monthly);section('#purchase-date-field',!monthly);section('#entry-paid-field',!installments&&!(monthly&&state.editId));
  section('#recurrence-until-field',monthly&&form.elements.recurrenceEnd.value==='until');
  $('#amount-label').textContent=monthly?'Qual é o valor mensal?':installments?'Qual foi o valor total da compra?':'Quanto você gastou?';
  $('#amount-note').textContent=monthly?'Ex.: R$ 135,00 por mês no plano da VIVO.':installments?'Informe o total da compra. O 4J calcula o valor de cada parcela.':'Informe o valor da despesa.';
  $('#due-date-label').textContent=monthly?'Primeiro vencimento':installments?'Vencimento da 1ª parcela':'Pagamento ou vencimento';
  $('#due-date-note').textContent=installments?'Use a data original da primeira parcela, mesmo que já esteja paga.':monthly?'Os meses seguintes repetem este dia. No mês mais curto, usamos o último dia.':'É esta data que define o mês do relatório.';
  $('#entry-paid-label').textContent=monthly?'A primeira mensalidade já foi paga?':'Pagamento';
  const f=new FormData(form),amount=Money.parse(f.get('amount')),date=f.get('date'),preview=$('#schedule-preview');preview.hidden=mode==='once';
  if(preview.hidden)return;
  if(!Money.validDate(date)||!Number.isFinite(amount)||amount<=0){preview.textContent='Preencha o valor e o primeiro vencimento para conferir o calendário.';return;}
  if(monthly){const until=f.get('recurrenceEnd')==='until'?f.get('recurrenceUntil'):'';preview.textContent=`${fmt(amount)} por mês, a partir de ${Money.date(date)}${until&&/^\d{4}-\d{2}$/.test(until)?', até '+monthName(until):', sem data para terminar'}. Cada mês tem seu próprio pagamento.`;return;}
  const count=Number(f.get('installments')),paid=Number(f.get('paidInstallments'));
  if(!Number.isInteger(count)||count<2||count>600||!Number.isInteger(paid)||paid<0||paid>count){preview.textContent='Confira o número de parcelas e a quantidade já paga.';return;}
  const rows=Money.occurrences({valor:amount,data:date,parcelas:count,jaPagas:paid}),next=rows[paid],first=rows[0],last=rows.at(-1);
  preview.textContent=`${count} parcelas de aproximadamente ${fmt(first.value)}. De ${Money.date(first.date)} até ${Money.date(last.date)}. ${paid} já paga(s). ${next?'Próxima parcela não paga: '+(paid+1)+'/'+count+', '+fmt(next.value)+' em '+Money.date(next.date)+'.':'Todas as parcelas já foram pagas.'} Os centavos são distribuídos para fechar o total da compra.`;
}
document.addEventListener('change',e=>{if(e.target.closest?.('#entry-form')&&['expenseMode','recurrenceEnd'].includes(e.target.name))syncEntrySchedule();});
document.addEventListener('input',e=>{if(e.target.closest?.('#entry-form')&&['amount','date','installments','paidInstallments','recurrenceUntil'].includes(e.target.name))syncEntrySchedule();});
function entryRecordFromForm(f,type,id){
  const expense=type==='despesa',existing=id?Store.data[expense?'despesas':'receitas'].find(r=>r.id===id):null,mode=expense?(f.get('expenseMode')||'once'):'once';
  if(id&&!existing)throw new Error('Lançamento não encontrado.');
  if(!['once','installments','monthly'].includes(mode)||existing&&expense&&mode!==expenseMode(existing))throw new Error('Mantenha o tipo original do lançamento.');
  const amount=Money.parse(f.get('amount')),date=String(f.get('date')||''),purchaseDate=expense&&mode!=='monthly'?String(f.get('purchaseDate')||''):'';
  if(!Number.isFinite(amount)||amount<=0||amount>999999999)throw new Error('Informe um valor maior que zero, como 125,50.');
  if(!Money.validDate(date))throw new Error('Confira a data de vencimento ou recebimento.');
  if(purchaseDate&&(!Money.validDate(purchaseDate)||purchaseDate>date))throw new Error('A data da compra deve ser válida e não pode ser posterior ao primeiro vencimento.');
  if(!String(f.get('description')||'').trim())throw new Error('Conte o que foi este lançamento.');
  if(!f.get('category')||f.get('category')==='__new')throw new Error('Selecione uma categoria.');
  const data={desc:String(f.get('description')).trim(),cat:f.get('category'),valor:amount,data:date};
  if(expense){const installments=mode==='installments'?Number(f.get('installments')):1,paid=mode==='installments'?Number(f.get('paidInstallments')):mode==='monthly'?0:Number(f.get('paid'));
    if(!Number.isInteger(installments)||installments<(mode==='installments'?2:1)||installments>600||!Number.isInteger(paid)||paid<0||paid>installments)throw new Error('Confira as parcelas e a quantidade já paga.');
    Object.assign(data,{forma:f.get('payment'),parcelas:installments,jaPagas:paid,purchaseDate,reembolsavel:f.has('reimbursable'),reembolsado:f.has('reimbursed')});
    if(mode==='monthly'){
      const until=f.get('recurrenceEnd')==='until'?String(f.get('recurrenceUntil')||''):'';
      if(f.get('recurrenceEnd')==='until'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(until))throw new Error('Escolha o último mês da recorrência.');
      if(existing&&date!==existing.data)throw new Error('Mantenha o primeiro vencimento da série. Para mudar o dia, encerre esta recorrência e cadastre uma nova.');
      data.recurrence={frequency:'monthly',until};
      if(!id)data.recurrencePaid=Number(f.get('paid'))===1?[date.slice(0,7)]:[];
      const problem=Recurrence.validate({...existing,...data});if(problem)throw new Error(problem);
    }
  }
  return data;
}
