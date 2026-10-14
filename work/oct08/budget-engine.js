/* Monthly planning. Money stays in integer cents until presentation. */
const Budget={
  defaults:{fixed:50,reserve:20,variable:30},
  keys:['fixed','reserve','variable'],
  labels:{fixed:'Despesas fixas',reserve:'Reserva',variable:'Despesas variáveis'},
  validMonth:m=>typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m),
  validatePlan(plan){if(!plan||!this.keys.every(k=>Number.isInteger(plan[k])&&plan[k]>=0&&plan[k]<=100)||this.keys.reduce((s,k)=>s+plan[k],0)!==100)throw new Error('Os três percentuais precisam somar 100%. Use números inteiros de 0 a 100.');return Object.fromEntries(this.keys.map(k=>[k,plan[k]]));},
  plan(meta){try{return this.validatePlan(meta.budgetPlan);}catch{return {...this.defaults};}},
  validateMonths(months){if(!months||typeof months!=='object'||Array.isArray(months)||Object.keys(months).length>1200)throw new Error('Histórico de reservas inválido.');const result={};for(const [m,v] of Object.entries(months)){if(!this.validMonth(m)||typeof v!=='number'||!Number.isFinite(v)||v<0||v>999999999||Math.abs(v*100-Math.round(v*100))>0.001)throw new Error('Confira o mês e o valor da reserva.');result[m]=v;}return result;},
  group(row){if(['fixed','variable'].includes(row.budgetGroup))return row.budgetGroup;return row.recurrence?.frequency==='monthly'||['Moradia','Educação','Saúde','Assinaturas'].includes(row.cat)?'fixed':'variable';},
  analyze(rows,meta,month){
    const plan=this.plan(meta),expenses=rows.filter(r=>r.type==='despesa'&&r.date.startsWith(month)),income=rows.filter(r=>r.type==='receita'&&r.date.startsWith(month)).reduce((s,r)=>s+Money.cents(r.value),0);
    // Largest remainder allocation keeps every cent, including very small incomes.
    const limits=Object.fromEntries(this.keys.map(k=>[k,Math.floor(income*plan[k]/100)]));
    const order=[...this.keys].sort((a,b)=>(income*plan[b]%100)-(income*plan[a]%100));
    for(let rest=income-this.keys.reduce((s,k)=>s+limits[k],0),i=0;rest>0;rest--,i++)limits[order[i%3]]++;
    const reserveKnown=Object.hasOwn(meta.budgetMonths||{},month),spent={fixed:0,reserve:Money.cents(meta.budgetMonths?.[month]||0),variable:0};
    for(const r of expenses)spent[this.group(r)]+=Money.cents(r.value);
    const groups=this.keys.map(key=>({key,label:this.labels[key],percent:plan[key],limit:limits[key],actual:spent[key],delta:spent[key]-limits[key],ratio:income?spent[key]/income*100:null}));
    return {month,plan,income,groups,expenses,reserveKnown,suggested:expenses.filter(r=>!['fixed','variable'].includes(r.budgetGroup)).length,available:income-spent.fixed-spent.variable-spent.reserve};
  },
  advice(b){
    const cash=c=>Money.format(c/100),percent=n=>n.toLocaleString('pt-BR',{maximumFractionDigits:1}),lines=[];
    if(!b.income)return 'Ainda não há receitas registradas neste mês para calcular os limites. Cadastre o valor líquido recebido em Lançamentos. Suas despesas já aparecem aqui; depois eu comparo com o plano.';
    const over=b.groups.filter(g=>g.key!=='reserve'&&g.delta>0).sort((a,b)=>b.delta-a.delta);
    for(const g of b.groups.filter(g=>g.key!=='reserve'))lines.push(`${g.label}: ${cash(g.actual)} (${percent(g.ratio)}% da renda). ${g.delta>0?`Acima do limite em ${cash(g.delta)} — ${percent(g.ratio-g.percent)} pontos percentuais.`:g.delta===0?'Você chegou ao limite planejado.':`Ainda cabem ${cash(-g.delta)} no limite planejado.`}`);
    if(over.length){const main=over[0],grouped=new Map();for(const row of b.expenses.filter(r=>this.group(r)===main.key))grouped.set(row.cat||'Sem categoria',(grouped.get(row.cat||'Sem categoria')||0)+Money.cents(row.value));const top=[...grouped].sort((a,b)=>b[1]-a[1])[0];lines.push(`Por onde começar: em ${main.label.toLowerCase()}, ${top[0]} concentra ${cash(top[1])}. Confira esses lançamentos e veja quais próximos gastos podem ser reduzidos ou renegociados.`);}
    else lines.push('As despesas registradas estão dentro dos limites. Continue incluindo os gastos para acompanhar o mês.');
    const reserve=b.groups.find(g=>g.key==='reserve');
    lines.push(!b.reserveKnown?`Reserva: a meta é ${cash(reserve.limit)}. Informe em “Registrar reserva” o total que você separou neste mês para eu acompanhar.`:reserve.delta>=0?`Reserva: ${cash(reserve.actual)} registrados; você alcançou a meta de ${cash(reserve.limit)} do mês.`:`Reserva: ${cash(reserve.actual)} de ${cash(reserve.limit)}. Faltam ${cash(-reserve.delta)} para a meta deste mês; ajuste os próximos passos ao que couber.`);
    if(b.available<0)lines.push(`Atenção ao conjunto: despesas + reserva registrada superam as receitas do mês em ${cash(-b.available)}. Confira se usou saldo anterior e revise o planejamento antes de separar mais dinheiro.`);
    if(b.suggested)lines.push(`${b.suggested} despesa(s) usam classificação sugerida. Revise em “Conferir fixas e variáveis” para deixar a análise mais fiel.`);
    lines.push('Leitura parcial dos seus registros: inclui despesas pagas e previstas do mês. Não é saldo bancário.');return lines.join('\n\n');
  }
};
Store.saveBudget=async function({plan,month,reserve}){
  this.assertEdit();if(this.loading||this.error||!this.profile)throw new Error('Aguarde o carregamento do perfil.');
  const checkedPlan=plan===undefined?undefined:Budget.validatePlan(plan);
  const checkedMonths=month===undefined?undefined:Budget.validateMonths({[month]:reserve});
  const merge=meta=>({...checkedPlan?{budgetPlan:checkedPlan}:{},...checkedMonths?{budgetMonths:Budget.validateMonths({...meta.budgetMonths,...checkedMonths})}:{}});
  if(this.demo){Object.assign(this.meta,merge(this.meta));this.emit();return;}
  const context={db:this.db,user:{uid:this.user.uid,email:this.user.email},userDoc:{name:this.userDoc?.name}},ref=context.db.collection('profiles').doc(this.profile);
  await context.db.runTransaction(async tx=>{const {account,metas}=await ProfileOps.authorized(tx,context,[ref]);ProfileOps.requireAccess(context,metas[0],account);tx.update(ref,{...merge(metas[0]),...ProfileOps.stamp(context)});});
};
