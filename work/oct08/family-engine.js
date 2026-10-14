/* A family settlement is a personal expense and, when authorized, a matching receivable.
   Both documents change atomically. A settlement is not the card issuer's payment status. */
const Family={
  fields:['desc','cat','valor','data','forma','parcelas','jaPagas','reembolsavel','reembolsado','purchaseDate','recurrence','recurrencePaid','budgetGroup'],
  is:record=>!!record?.family&&['pay','receive'].includes(record.family.direction),
  linked:record=>!!record?.family?.linkedRecordId,
  validId:value=>typeof value==='string'&&value.length>0&&value.length<=1500&&!value.includes('/'),
  validate(record,{pending=true}={}){
    if(record.family===undefined||record.family===null)return '';
    const f=record.family;
    if(typeof f!=='object'||Array.isArray(f)||!['pay','receive'].includes(f.direction))return 'Escolha se você vai repassar ou receber o dinheiro.';
    if(typeof f.person!=='string'||!f.person.trim()||f.person.length>70)return 'Informe o nome da pessoa, com até 70 caracteres.';
    if(f.card!==undefined&&(typeof f.card!=='string'||f.card.length>60))return 'Use um nome de cartão com até 60 caracteres.';
    const hasProfile=f.linkedProfileId!==undefined,hasRecord=f.linkedRecordId!==undefined,hasAgreement=f.agreementId!==undefined;
    if([['linkedProfileId',hasProfile],['linkedRecordId',hasRecord],['agreementId',hasAgreement]].some(([key,has])=>has&&!this.validId(f[key])))return 'O vínculo do acerto é inválido. Reabra o lançamento.';
    if((hasRecord||hasAgreement)&&!(hasProfile&&hasRecord&&hasAgreement))return 'O vínculo do acerto está incompleto. Reabra o lançamento.';
    if(hasProfile&&!hasRecord&&!pending)return 'O vínculo do acerto está incompleto. Reabra o lançamento.';
    if(typeof record.valor!=='number'||!Number.isFinite(record.valor)||record.valor<0.01||record.valor>999999999||Math.abs(record.valor*100-Math.round(record.valor*100))>0.001)return 'Confira o valor da sua parte no acerto.';
    if(!Money.validDate(record.data)||!Number.isInteger(record.parcelas)||record.parcelas<1||record.parcelas>600||!Number.isInteger(record.jaPagas)||record.jaPagas<0||record.jaPagas>record.parcelas)return 'Confira as datas e as parcelas do acerto.';
    if(record.purchaseDate&&(!Money.validDate(record.purchaseDate)||record.purchaseDate>record.data))return 'Confira a data de compra do acerto.';
    if(Recurrence.is(record))return Recurrence.validate(record);
    if(record.recurrence!==undefined&&record.recurrence!==null)return 'A repetição do acerto é inválida.';
    return '';
  },
  requireValid(record,options){const error=this.validate(record,options);if(error)throw new Error(error);if(Recurrence.is(record)){const recurrenceError=Recurrence.validate(record);if(recurrenceError)throw new Error(recurrenceError);}},
  manual(family){return{direction:family.direction,person:family.person,card:family.card||''};},
  clean(record){const result={};for(const [key,value] of Object.entries(record))if(key!=='id'&&value!==undefined)result[key]=structuredClone(value);return result;},
  context(){
    Store.assertEdit();
    if(!Store.profile||!Store.user?.uid)throw new Error('Entre novamente para registrar o acerto.');
    const context={profile:Store.profile,user:{uid:Store.user.uid,email:Store.user.email},userDoc:{...Store.userDoc},db:Store.db,demo:Store.demo,spaces:Store.demoSpaces};
    if(context.demo)context.db=this.demoDb(context);
    if(!context.db)throw new Error('Não foi possível conectar. Tente novamente.');
    return context;
  },
  demoDb(context){
    const ref=path=>({path,id:path.split('/').at(-1),collection:key=>ref(path+'/'+key),doc:id=>ref(path+'/'+(id||crypto.randomUUID()))});
    return{collection:key=>ref(key),runTransaction:async callback=>{
      const read=path=>{const [group,id,cat,row]=path.split('/');if(group==='users')return id===context.user.uid?{...context.userDoc,status:context.userDoc.status||'approved'}:undefined;const space=context.spaces?.[id];return cat?space?.data[cat]?.find(item=>item.id===row):space?.meta;},writes=[];
      const tx={get:async target=>{const data=read(target.path);return{exists:data!==undefined,data:()=>structuredClone(data)};},set:(target,data)=>writes.push({target,data:this.clean(data),mode:'set'}),update:(target,data)=>writes.push({target,data:this.clean(data),mode:'update'}),delete:target=>writes.push({target,mode:'delete'})};
      const result=await callback(tx);
      // Apply only after every authorization and reciprocal-link check has succeeded.
      for(const {target,data,mode} of writes){const [,profile,cat,id]=target.path.split('/'),space=context.spaces[profile];if(!cat){Object.assign(space.meta,data);continue;}const rows=space.data[cat],index=rows.findIndex(row=>row.id===id);if(mode==='delete'){if(index>=0)rows.splice(index,1);}else if(index>=0)rows[index]={...(mode==='update'?rows[index]:{}),...data,id};else rows.push({...data,id});}
      if(Store.demo&&Store.demoSpaces===context.spaces&&Store.user?.uid===context.user.uid){const active=context.spaces[Store.profile];if(active){Store.meta=active.meta;Store.data=active.data;}Store.emit();}
      return result;
    }};
  },
  mirror(source,target){
    const mirrored={...target};for(const key of this.fields){if(Object.hasOwn(source,key))mirrored[key]=structuredClone(source[key]);else delete mirrored[key];}
    mirrored.family={...target.family,card:source.family.card||''};return mirrored;
  },
  async change(operation,id,input={},payment={}){
    const context=this.context();
    if(operation!=='save'&&!id)throw new Error('Lançamento não encontrado.');
    if(id!=null&&!this.validId(id))throw new Error('Lançamento não encontrado.');
    const db=context.db,sourceRef=db.collection('profiles').doc(context.profile),sourceItem=sourceRef.collection('despesas').doc(id||undefined),proposed=this.clean(input);
    return db.runTransaction(async tx=>{
      const {account,metas}=await ProfileOps.authorized(tx,context,[sourceRef]);ProfileOps.requireAccess(context,metas[0],account);
      const snapshot=id?await tx.get(sourceItem):null;
      if(id&&!snapshot.exists)throw new Error('Este lançamento já foi excluído. Atualize a página.');
      const current=snapshot?.data()||{},existing=current.family,wasLinked=this.linked(current);
      if(existing)this.requireValid(current,{pending:false});
      let source=operation==='save'?{...current,...proposed}:this.clean(current);
      if(wasLinked){
        const supplied=proposed.family;
        if(operation==='save'&&Object.hasOwn(proposed,'family')&&(!supplied||supplied.direction!==existing.direction||supplied.linkedProfileId!==existing.linkedProfileId||(supplied.linkedRecordId!==undefined&&supplied.linkedRecordId!==existing.linkedRecordId)||(supplied.agreementId!==undefined&&supplied.agreementId!==existing.agreementId)))throw new Error('Não é possível trocar a pessoa ou o perfil de um acerto sincronizado. Desvincule o acerto primeiro.');
        source.family={...existing,...(supplied||{})};
      }else if(operation==='save'&&(source.family?.linkedRecordId||source.family?.agreementId))throw new Error('Este vínculo não pertence ao lançamento. Crie um novo acerto.');
      const targetId=wasLinked?existing.linkedProfileId:source.family?.linkedProfileId;
      let targetRef=null,targetItem=null,target=null,originalTarget=null;
      if(targetId){
        if(!this.validId(targetId)||targetId===context.profile)throw new Error('Escolha outro perfil para sincronizar o acerto.');
        targetRef=db.collection('profiles').doc(targetId);
        const targetSnapshot=await tx.get(targetRef);if(!targetSnapshot.exists)throw new Error('O perfil da outra pessoa já não existe.');
        ProfileOps.requireAccess(context,targetSnapshot.data(),account);
        targetItem=targetRef.collection('despesas').doc(wasLinked?existing.linkedRecordId:undefined);
        if(wasLinked){
          const paired=await tx.get(targetItem);if(!paired.exists)throw new Error('O outro lado do acerto não foi encontrado. Nenhum dos lados foi alterado.');
          target=paired.data();originalTarget=structuredClone(target);
          if(target.family?.linkedProfileId!==context.profile||target.family?.linkedRecordId!==sourceItem.id||target.family?.agreementId!==existing.agreementId||target.family?.direction!==(existing.direction==='pay'?'receive':'pay'))throw new Error('Os vínculos do acerto não conferem. Nenhum dos lados foi alterado.');
        }
      }
      if(operation==='remove'){
        tx.delete(sourceItem);if(targetItem)tx.delete(targetItem);
      }else{
        if(operation==='detach'){
          if(!wasLinked)throw new Error('Este acerto já é controlado manualmente.');
          source.family=this.manual(existing);target={...target,family:this.manual(target.family)};
        }else{
          if(operation==='paid'){
            if(!this.is(source))throw new Error('Este lançamento não é um acerto familiar.');
            if(Recurrence.is(source)){
              Recurrence.requireOccurrence(source,payment.monthKey);
              source.recurrencePaid=[...new Set([...(source.recurrencePaid||[]),...(target?.recurrencePaid||[]),payment.monthKey])].sort();
            }else{
              if(!Number.isInteger(payment.idx)||payment.idx<0||payment.idx>=source.parcelas)throw new Error('Confira a parcela do repasse.');
              source.jaPagas=Math.max(source.jaPagas||0,target?.jaPagas||0,payment.idx+1);
            }
          }
          // An old edit form must not undo a repasse registered on another device.
          if(this.is(source)&&this.is(current)){
            if(Recurrence.is(source))source.recurrencePaid=[...new Set([...(current.recurrencePaid||[]),...(source.recurrencePaid||[]),...(target?.recurrencePaid||[])])].sort();
            else source.jaPagas=Math.max(current.jaPagas||0,source.jaPagas||0,target?.jaPagas||0);
          }
          if(targetItem&&!wasLinked){
            const agreementId=crypto.randomUUID();source.family={...this.manual(source.family),linkedProfileId:targetId,linkedRecordId:targetItem.id,agreementId};
            target={family:{direction:source.family.direction==='pay'?'receive':'pay',person:String(metas[0].displayName||context.profile).slice(0,70),card:source.family.card,linkedProfileId:context.profile,linkedRecordId:sourceItem.id,agreementId}};
          }
          this.requireValid(source,{pending:false});
          if(targetItem){target=this.mirror(source,target);this.requireValid(target,{pending:false});}
        }
        if(operation==='paid'&&ProfileOps.signature(this.clean(source))===ProfileOps.signature(this.clean(current))&&(!targetItem||ProfileOps.signature(this.clean(target))===ProfileOps.signature(this.clean(originalTarget))))return{id:sourceItem.id,linked:!!targetItem,linkedProfileId:targetId||''};
        tx.set(sourceItem,this.clean(source));if(targetItem)tx.set(targetItem,this.clean(target));
      }
      if(!context.demo){const stamp=ProfileOps.stamp(context);tx.update(sourceRef,stamp);if(targetRef)tx.update(targetRef,stamp);}
      return{id:sourceItem.id,linked:!!targetItem&&operation!=='detach',linkedProfileId:targetId||''};
    });
  },
  saveRecord(type,record,id){if(type!=='despesa')return this.original.saveRecord.call(Store,type,record,id);return this.change('save',id,record);},
  removeRecord(type,id){if(type!=='despesa')return this.original.removeRecord.call(Store,type,id);return this.change('remove',id);},
  markPaid(id,idx,monthKey){return this.change('paid',id,{}, {idx,monthKey});},
  detach(id){return this.change('detach',id);},
  install(){if(this.original)return;this.original={saveRecord:Store.saveRecord,removeRecord:Store.removeRecord};Store.saveRecord=(type,record,id)=>this.saveRecord(type,record,id);Store.removeRecord=(type,id)=>this.removeRecord(type,id);}
};
