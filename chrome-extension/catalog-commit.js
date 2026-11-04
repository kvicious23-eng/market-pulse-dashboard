// One local catalogue transaction owns storage + the completed download.
(function(root){
  const signature=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  const filename=agent=>/Whale\//.test(agent)?'MarketPulse/whale-product-catalog.json':/Edg\//.test(agent)?'MarketPulse/edge-product-catalog.json':'MarketPulse/product-catalog.json';
  function create(api){
    let busy=false;const unsettled=new Set();
    return {isBusy:()=>busy||unsettled.size>0,async save(message){
      if(busy||unsettled.size)return {ok:false,error:'catalog-save-busy'};
      busy=true;let settingsSaved=false,downloadId=null,record=null;
      const end=api.now()+25000;
      async function call(factory,label,limit=5000){
        const remaining=end-api.now();if(remaining<=0)throw Error('catalog-save-timeout');let timer;
        try{const task=Promise.resolve().then(factory);unsettled.add(task);task.then(()=>unsettled.delete(task),()=>unsettled.delete(task));return await Promise.race([task,new Promise((_,reject)=>{timer=api.setTimeout(()=>reject(Error(label+'-timeout')),Math.min(remaining,limit));})]);}finally{api.clearTimeout(timer);}
      }
      const validPath=item=>String(item?.filename||'').replaceAll('\\','/').endsWith('/'+filename(api.agent));
      try{
        const errors=api.validate(message.products);if(errors.length)throw Error('catalog-validation-failed');
        const products=message.products.map(api.clean),wanted=signature(products);
        const prior=(await call(()=>api.storage.get('catalogCommit'),'catalog-journal-read')).catalogCommit;
        if(prior){
          if(prior.version!==1||!['settings','download-requested'].includes(prior.stage)||prior.filename!==filename(api.agent)||typeof prior.productsSignature!=='string'||!Number.isFinite(Date.parse(prior.at)))throw Error('catalog-journal-invalid');
          // Never start a competing file overwrite after a lost download acknowledgement.
          if(prior.stage==='settings'){await call(()=>api.storage.remove('catalogCommit'),'catalog-journal-clear');}
          else {
          if(!Number.isInteger(prior.downloadId))throw Error('catalog-file-unresolved');
          const [item]=await call(()=>api.downloads.search({id:prior.downloadId}),'catalog-file-status');
          if(!item||item.state==='in_progress')throw Error('catalog-file-pending');
          if(item.state==='complete'&&!validPath(item))throw Error('catalog-save-path-mismatch');
          if(!['complete','interrupted'].includes(item.state))throw Error('catalog-file-unresolved');
          const current=await call(()=>api.getProducts(),'catalog-current');
          if(item.state==='complete'&&prior.productsSignature===wanted&&signature(current)===wanted){await call(()=>api.storage.remove('catalogCommit'),'catalog-journal-clear');return {ok:true,persisted:true,recovered:true};}
          await call(()=>api.storage.remove('catalogCommit'),'catalog-journal-clear');
          }
        }
        const current=await call(()=>api.getProducts(),'catalog-current');
        if(typeof message.baseSignature!=='string'||(message.baseSignature!==signature(current)&&wanted!==signature(current)))throw Error('catalog-conflict');
        record={version:1,stage:'settings',filename:filename(api.agent),productsSignature:wanted,at:new Date(api.now()).toISOString(),downloadId:null};
        await call(()=>api.storage.set({catalogCommit:record}),'catalog-journal-save');
        await call(()=>api.storage.set({products}),'catalog-settings-save');settingsSaved=true;
        record={...record,stage:'download-requested'};await call(()=>api.storage.set({catalogCommit:record}),'catalog-journal-save');
        const payload={version:1,savedAt:new Date(api.now()).toISOString(),products};
        downloadId=await call(()=>api.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(payload,null,2)),filename:record.filename,conflictAction:'overwrite',saveAs:false}),'catalog-download',10000);
        if(!Number.isInteger(downloadId))throw Error('catalog-download-no-id');
        record={...record,downloadId};await call(()=>api.storage.set({catalogCommit:record}),'catalog-journal-save');
        for(let i=0;i<30;i++){
          const [item]=await call(()=>api.downloads.search({id:downloadId}),'catalog-file-status',2000);
          if(!item||item.state==='interrupted')throw Error('catalog-save-failed');
          if(item.state==='complete'){
            if(!validPath(item))throw Error('catalog-save-path-mismatch');
            await call(()=>api.storage.remove('catalogCommit'),'catalog-journal-clear');return {ok:true,persisted:true};
          }
          await call(()=>api.wait(500),'catalog-save-wait',1000);
        }
        throw Error('catalog-save-timeout');
      }catch(error){return {ok:false,error:String(error?.message||error),settingsSaved,recoveryPending:record?.stage==='download-requested'||/catalog-file-(?:pending|unresolved)/.test(String(error?.message))};}
      finally{busy=false;}
    }};
  }
  const api={signature,filename,create};root.CatalogCommit=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
