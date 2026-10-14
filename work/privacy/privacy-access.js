/* Financial authorization is independent of the platform account role. */
const Privacy={
  shared(store,meta,edit=false){const email=String(store.user?.email||'').toLowerCase();return store.user?.emailVerified===true&&((meta?.sharedEdit||[]).includes(email)||(!edit&&(meta?.sharedView||[]).includes(email)));},
  canRead(store,meta){return !!store.user?.uid&&!!meta?.ownerUid&&(meta.ownerUid===store.user.uid||this.shared(store,meta)||FamilyGroups.canRead(store,meta));},
  canEdit(store,meta){return !!store.user?.uid&&!!meta?.ownerUid&&(meta.ownerUid===store.user.uid||this.shared(store,meta,true)||FamilyGroups.canEdit(store,meta));},
  async loadFreshFamily(tx,store,meta){
    if(!meta?.familyId||meta.ownerUid===store.user?.uid||this.shared(store,meta,true))return;
    const id=meta.familyId,snapshot=await tx.get(store.db.collection('families').doc(id));
    store.families=[...(store.families||[]).filter(f=>f.id!==id),...(snapshot.exists?[{...snapshot.data(),id}]:[])];
  }
};
