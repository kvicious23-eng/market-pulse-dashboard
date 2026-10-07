import {SupplierConnector, CHECK_ALARM, permittedUrl, inspectSupplierPage, submitSupplierLogin} from './auth-core.mjs';
const HOST='com.marketpulse.supplierhub';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function native(operation) {
  let timer;
  try { return await Promise.race([chrome.runtime.sendNativeMessage(HOST,{operation}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('native_timeout')),10000);})]); }
  finally { clearTimeout(timer); }
}
async function tab(id) { if(id==null) return null; try { return await chrome.tabs.get(id); } catch { return null; } }
async function probe(id) {
  for(let i=0;i<8;i++) {
    const t=await tab(id); if(!t || !permittedUrl(t.url)) return {state:'unverified'};
    if(t.status==='complete') {
      try { return (await chrome.scripting.executeScript({target:{tabId:id},func:inspectSupplierPage}))[0]?.result||{state:'unverified'}; } catch { /* redirect may still be in progress */ }
    }
    await delay(750);
  }
  return {state:'unverified'};
}
const connector=new SupplierConnector({
  load:async()=> (await chrome.storage.local.get('connection')).connection,
  save:async connection=>chrome.storage.local.set({connection}),
  now:()=>Date.now(),sleep:delay,native,tab,probe,
  refresh:async id=>{await chrome.tabs.reload(id,{bypassCache:true});await delay(750);},
  open:url=>chrome.tabs.create({url,active:false}),
  submit:async(id,username,password)=>{
    const t=await tab(id); if(!t || !permittedUrl(t.url)) return {submitted:false};
    if((await probe(id)).state!=='login_form') return {submitted:false};
    return (await chrome.scripting.executeScript({target:{tabId:id},func:submitSupplierLogin,args:[username,password]}))[0]?.result;
  }
});
async function schedule() {
  const s=await connector.read();
  if(s.enabled) await chrome.alarms.create(CHECK_ALARM,{delayInMinutes:1,periodInMinutes:15});
  else await chrome.alarms.clear(CHECK_ALARM);
}
chrome.action.onClicked.addListener(()=>chrome.runtime.openOptionsPage());
chrome.runtime.onInstalled.addListener(()=>schedule());
chrome.runtime.onStartup.addListener(async()=>{await schedule();if((await connector.read()).enabled) await connector.check();});
chrome.alarms.onAlarm.addListener(async alarm=>{if(alarm.name===CHECK_ALARM && (await connector.read()).enabled) await connector.check();});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  // Only this extension's options page can start actions; web pages/content scripts cannot.
  if(sender.id!==chrome.runtime.id || sender.url!==chrome.runtime.getURL('options.html')) return false;
  const run=async()=>{
    if(message.type==='STATUS') {
      let vault; try {vault=await native('status');} catch {vault={ok:false,configured:false};}
      return {state:await connector.read(),vault};
    }
    if(message.type==='CHECK') return connector.check();
    if(message.type==='ENABLE') {await chrome.storage.local.set({connection:{...await connector.read(),enabled:message.enabled===true}});await schedule();return connector.read();}
    if(message.type==='CONFIGURE') return native('configure');
    if(message.type==='FORGET') {const r=await native('delete');if(!r.ok) return r;await chrome.storage.local.set({connection:{...await connector.read(),enabled:false,blockedVersion:'',lastAutoAt:0,pendingAttempt:false}});await schedule();return connector.state('credentials_required','credentials_removed');}
    if(message.type==='OPEN') {const s=await connector.read();let t=await tab(s.tabId);if(!t || !permittedUrl(t.url)) {t=await chrome.tabs.create({url:'https://supplier.coupang.com/',active:true});await chrome.storage.local.set({connection:{...s,tabId:t.id}});}else await chrome.tabs.update(t.id,{active:true});return {ok:true};}
    return {ok:false};
  };
  run().then(reply).catch(()=>reply({ok:false,reason:'local_connection_error'}));return true;
});
