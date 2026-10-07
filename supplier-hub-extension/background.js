import {SupplierConnector, CHECK_ALARM, permittedUrl, officialOrPending, probeSupplierTab, inspectSupplierPage, submitSupplierLogin} from './auth-core.mjs';
import {PremiumViewer, inspectPremiumPage} from './premium-core.mjs';
import {clickSupplierCsvDownload} from './csv-core.mjs';
const HOST='com.marketpulse.supplierhub';
let csvClickRunning=false;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function native(operation) {
  let timer;
  try { return await Promise.race([chrome.runtime.sendNativeMessage(HOST,{operation}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('native_timeout')),10000);})]); }
  finally { clearTimeout(timer); }
}
async function tab(id) { if(id==null) return null; try { return await chrome.tabs.get(id); } catch { return null; } }
async function probe(id) {
  return probeSupplierTab({extensionVersion:chrome.runtime.getManifest().version,tab,sleep:delay,inspect:async tabId=>(await chrome.scripting.executeScript({target:{tabId},func:inspectSupplierPage}))[0]?.result},id);
}
const premium=new PremiumViewer({
  extensionVersion:chrome.runtime.getManifest().version,now:()=>Date.now(),tab,sleep:delay,
  load:async()=> (await chrome.storage.local.get('premium')).premium,
  save:async value=>chrome.storage.local.set({premium:value}),
  open:url=>chrome.tabs.create({url,active:true}),activate:id=>chrome.tabs.update(id,{active:true}),
  inspect:async tabId=>(await chrome.scripting.executeScript({target:{tabId},func:inspectPremiumPage}))[0]?.result
});
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
      return {state:await connector.read(),vault,premium:(await chrome.storage.local.get('premium')).premium?.report};
    }
    if(message.type==='CHECK') return connector.check();
    if(message.type==='OPEN_PREMIUM') return premium.check(true);
    if(message.type==='CHECK_PREMIUM') return premium.check();
    if(message.type==='DOWNLOAD_CSV') {
      if(csvClickRunning)return {ok:false,reason:'csv_busy'};
      csvClickRunning=true;
      try {
        if((await premium.check())?.status!=='page_opened')return {ok:false,reason:'csv_page_not_ready'};
        const id=(await chrome.storage.local.get('premium')).premium?.tabId;
        if(id==null)return {ok:false,reason:'csv_wrong_page'};
        return (await chrome.scripting.executeScript({target:{tabId:id},func:clickSupplierCsvDownload}))[0]?.result||{ok:false,reason:'csv_click_error'};
      }catch{return {ok:false,reason:'csv_click_error'};}finally{csvClickRunning=false;}
    }
    if(message.type==='ENABLE') {await chrome.storage.local.set({connection:{...await connector.read(),enabled:message.enabled===true}});await schedule();return connector.read();}
    if(message.type==='CONFIGURE') return native('configure');
    if(message.type==='FORGET') {const r=await native('delete');if(!r.ok) return r;await chrome.storage.local.set({connection:{...await connector.read(),enabled:false,blockedVersion:'',lastAutoAt:0,pendingAttempt:false}});await schedule();return connector.state('credentials_required','credentials_removed');}
    if(message.type==='OPEN') {const s=await connector.read();let t=await tab(s.tabId);if(!officialOrPending(t)) {t=await chrome.tabs.create({url:'https://supplier.coupang.com/',active:true});await chrome.storage.local.set({connection:{...s,tabId:t.id}});}else await chrome.tabs.update(t.id,{active:true});return {ok:true};}
    return {ok:false};
  };
  run().then(reply).catch(()=>reply({ok:false,reason:'local_connection_error'}));return true;
});
