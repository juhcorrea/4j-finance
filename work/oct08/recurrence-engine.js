/* A recurring bill is one record; monthly occurrences are calculated only for the requested window. */
const Recurrence={
  maxWindow:1200,
  is:d=>!!d&&d.recurrence?.frequency==='monthly',
  monthIndex(value){
    if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))return null;
    const year=Number(value.slice(0,4));return year>=1?year*12+Number(value.slice(5,7))-1:null;
  },
  monthKey(index){return String(Math.floor(index/12)).padStart(4,'0')+'-'+String(index%12+1).padStart(2,'0');},
  daysInMonth(year,month){return [31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31][month-1];},
  validate(d){
    if(!this.is(d)||typeof d.recurrence!=='object'||Array.isArray(d.recurrence))return 'Escolha uma repetição mensal válida.';
    if(typeof d.data!=='string'||!Money.validDate(d.data)||this.monthIndex(d.data.slice(0,7))===null)return 'Confira a data da primeira cobrança.';
    const amount=Number(d.valor);
    if(d.valor===null||typeof d.valor==='boolean'||!Number.isFinite(amount)||amount<0.01||amount>999999999||Math.abs(amount*100-Math.round(amount*100))>0.001)return 'Confira o valor mensal da despesa.';
    const first=this.monthIndex(d.data.slice(0,7)),until=d.recurrence.until??'';
    if(until!==''&&(this.monthIndex(until)===null||this.monthIndex(until)<first))return 'O último mês deve ser igual ou posterior à primeira cobrança.';
    if(d.recurrencePaid!==undefined&&(!Array.isArray(d.recurrencePaid)||d.recurrencePaid.length>12000))return 'A lista de pagamentos recorrentes é inválida.';
    for(const key of d.recurrencePaid||[]){const index=this.monthIndex(key);if(index===null||index<first||(until!==''&&index>this.monthIndex(until)))return 'Confira os meses já pagos desta despesa recorrente.';}
    return '';
  },
  occurrences(d,fromMonth,toMonth){
    if(!this.is(d)||this.validate(d))return [];
    const from=this.monthIndex(fromMonth),to=this.monthIndex(toMonth);
    if(from===null||to===null||to<from||to-from+1>this.maxWindow)return [];
    const first=this.monthIndex(d.data.slice(0,7)),until=d.recurrence.until?this.monthIndex(d.recurrence.until):to,start=Math.max(first,from),end=Math.min(until,to),day=Number(d.data.slice(8,10)),paid=new Set(d.recurrencePaid||[]),rows=[];
    for(let index=start;index<=end;index++){
      const key=this.monthKey(index),year=Math.floor(index/12),month=index%12+1,date=key+'-'+String(Math.min(day,this.daysInMonth(year,month))).padStart(2,'0');
      rows.push({...d,type:'despesa',date,value:Money.cents(d.valor)/100,idx:index-first,paid:paid.has(key),total:1,recurring:true,monthKey:key});
    }
    return rows;
  },
  requireOccurrence(d,monthKey){
    const error=this.validate(d);if(error)throw new Error(error);
    if(!this.occurrences(d,monthKey,monthKey).length)throw new Error('Esse mês não faz parte desta despesa recorrente.');
  },
  async markPaid(id,monthKey){
    Store.assertEdit();
    if(typeof id!=='string'||!id||id.includes('/')||id.length>1500)throw new Error('Despesa não encontrada.');
    if(this.monthIndex(monthKey)===null)throw new Error('Confira o mês do pagamento.');
    const profile=Store.profile,user=Store.user?{uid:Store.user.uid,email:Store.user.email}:null,db=Store.db;
    const current=Store.data.despesas.find(d=>d.id===id);
    if(!current)throw new Error('Despesa não encontrada. Atualize a página.');
    this.requireOccurrence(current,monthKey);
    if(Store.demo){
      current.recurrencePaid=[...new Set([...(current.recurrencePaid||[]),monthKey])].sort();Store.emit();return;
    }
    if(!profile||!user?.uid||!db)throw new Error('Entre novamente para confirmar o pagamento.');
    const profileRef=db.collection('profiles').doc(profile),itemRef=profileRef.collection('despesas').doc(id),accountRef=db.collection('users').doc(user.uid);
    await db.runTransaction(async tx=>{
      const account=await tx.get(accountRef),meta=await tx.get(profileRef),item=await tx.get(itemRef);
      if(!account.exists||!meta.exists)throw new Error('Seu acesso a este perfil já não está disponível.');
      const accountData=account.data(),profileData=meta.data(),email=String(user.email||'').toLowerCase();
      if(accountData.status!=='approved'||!profileData.ownerUid||!(accountData.role==='admin'||profileData.ownerUid===user.uid||(Array.isArray(profileData.sharedEdit)&&profileData.sharedEdit.includes(email))))throw new Error('Você precisa de permissão para editar este perfil.');
      if(!item.exists)throw new Error('Esta despesa já foi excluída.');
      const fresh=item.data();this.requireOccurrence(fresh,monthKey);
      const months=[...new Set([...(fresh.recurrencePaid||[]),monthKey])].sort();
      if(months.length>12000)throw new Error('Limite de meses pagos atingido.');
      if(!(fresh.recurrencePaid||[]).includes(monthKey))tx.update(itemRef,{recurrencePaid:months});
    });
  }
};
