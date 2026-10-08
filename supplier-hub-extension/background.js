import {SupplierConnector, CHECK_ALARM, permittedUrl, officialOrPending, probeSupplierTab, inspectSupplierPage, submitSupplierLogin} from './auth-core.mjs';
import {PremiumViewer, inspectPremiumPage} from './premium-core.mjs';
import {clickSupplierCsvDownload} from './csv-core.mjs';
import {resumeAfterEdge} from './edge-resume-core.mjs';
import {DailyCsv,DAILY_CSV_ALARM,kstDay,csvName,supplierDownload} from './daily-csv-core.mjs';
const HOST='com.marketpulse.supplierhub';
let csvClickRunning=false;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function native(operation,payload={}) {
  let timer;
  try { return await Promise.race([chrome.runtime.sendNativeMessage(HOST,{operation,...payload}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('native_timeout')),15000);})]); }
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
const daily=new DailyCsv({
  now:()=>Date.now(),load:async()=>(await chrome.storage.local.get('dailyCsv')).dailyCsv,
  save:async value=>chrome.storage.local.set({dailyCsv:value}),
  signal:()=>native('morning_status'),authenticate:()=>connector.check(),authState:()=>connector.read(),
  prepare:async()=>{
    const id=(await chrome.storage.local.get('premium')).premium?.tabId;
    if(!await tab(id))return {ok:false,reason:'csv_page_not_ready'};
    let result;
    for(let i=0;i<20;i++){
      result=(await chrome.scripting.executeScript({target:{tabId:id},func:clickSupplierCsvDownload,args:[true]}))[0]?.result;
      if(result?.ok||!['csv_button_missing','csv_page_not_ready'].includes(result?.reason))return result;
      await delay(1000);
    }
    return result;
  },
  openPage:async(refresh=true)=>{
    const id=(await chrome.storage.local.get('premium')).premium?.tabId;
    if(refresh&&await tab(id)){await chrome.tabs.reload(id,{bypassCache:true});await delay(750);}
    return premium.check(true);
  },
  click:async()=>{
    if(csvClickRunning)return {ok:false,reason:'csv_busy'};
    csvClickRunning=true;
    try {const id=(await chrome.storage.local.get('premium')).premium?.tabId;
      return (await chrome.scripting.executeScript({target:{tabId:id},func:clickSupplierCsvDownload}))[0]?.result;
    }finally{csvClickRunning=false;}
  },
  downloads:job=>chrome.downloads.search({startedAfter:new Date(Date.parse(job.requestedAt)-2000).toISOString(),filenameRegex:'basic_operation_rocket_.*\\.csv$'}),
  validate:payload=>native('csv_complete',payload),publishStatus:()=>native('daily_status')
});
async function schedule() {
  const s=await connector.read();
  if(s.enabled) {if(!await chrome.alarms.get(CHECK_ALARM))await chrome.alarms.create(CHECK_ALARM,{delayInMinutes:1,periodInMinutes:15});}
  else await chrome.alarms.clear(CHECK_ALARM);
  if(!await chrome.alarms.get(DAILY_CSV_ALARM))await chrome.alarms.create(DAILY_CSV_ALARM,{delayInMinutes:1,periodInMinutes:1});
}
chrome.action.onClicked.addListener(()=>chrome.runtime.openOptionsPage());
chrome.runtime.onInstalled.addListener(()=>schedule());
chrome.runtime.onStartup.addListener(async()=>{await schedule();await daily.tick();});
chrome.alarms.onAlarm.addListener(async alarm=>{
  if(alarm.name===DAILY_CSV_ALARM)await daily.tick();
  else if(alarm.name===CHECK_ALARM && (await daily.read()).day===kstDay(Date.now()) && (await connector.read()).enabled){await connector.check();await daily.tick();}
});
// Observe actual file completion, not the scanner's initial download request.
chrome.downloads.onChanged.addListener(async delta=>{
  if(delta.state?.current!=='complete')return;
  const item=(await chrome.downloads.search({id:delta.id}))[0];
  if(/(?:^|[\\/])MarketPulse[\\/]latest-coupang-scan\.json$/i.test(item?.filename||'')||csvName(item?.filename))await daily.tick();
});
// Observe Supplier's original CSV download without registering a global filename
// listener. Such a listener can discard filenames requested by the price scanner,
// even when it calls suggest() without an override for an unrelated download.
// Native validation already accepts the Downloads root and preserves the source.
// Recreate alarms after extension reloads and recover a persisted, in-flight job.
schedule().then(()=>daily.tick()).catch(()=>{});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL('daily-resume.html')+'?')&&message?.type==='RESUME_AFTER_EDGE') {
    resumeAfterEdge(message,{signal:()=>native('morning_status'),acknowledge:(id,signal)=>chrome.runtime.sendMessage(id,{type:'MARK_MORNING_RECOVERED',...signal}),tick:()=>daily.tick()})
      .then(reply).catch(()=>reply({ok:false,reason:'local_connection_error'}));return true;
  }
  // Only this extension's options page can start actions; web pages/content scripts cannot.
  if(sender.id!==chrome.runtime.id || sender.url!==chrome.runtime.getURL('options.html')) return false;
  const run=async()=>{
    if(message.type==='STATUS') {
      let vault; try {vault=await native('status');} catch {vault={ok:false,configured:false};}
      let publication;try{publication=await native('daily_status');}catch{publication={reason:'daily_local_connection_error'};}
      return {state:await connector.read(),vault,premium:(await chrome.storage.local.get('premium')).premium?.report,daily:await daily.read(),publication};
    }
    if(message.type==='CHECK') {const result=await connector.check();await daily.tick();return result;}
    if(message.type==='OPEN_PREMIUM') return premium.check(true);
    if(message.type==='CHECK_PREMIUM') return premium.check();
    if(message.type==='DOWNLOAD_CSV') {
      if(['download','validating'].includes((await daily.read()).stage))return {ok:false,reason:'csv_busy'};
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
