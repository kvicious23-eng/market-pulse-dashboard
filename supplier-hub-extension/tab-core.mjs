import {permittedUrl} from './auth-core.mjs';

// Browser restarts invalidate saved IDs. Reuse a positively authenticated
// dashboard in this extension profile before opening another tab.
export async function findSupplierDashboard(io) {
  const candidates=await io.query({url:'https://supplier.coupang.com/dashboard/KR*'});
  for(const t of candidates.slice(0,10)) {
    if(t.pendingUrl||t.status!=='complete'||!permittedUrl(t.url)||!/^\/dashboard\/KR\/?$/.test(new URL(t.url).pathname))continue;
    if((await io.probe(t.id)).state==='authenticated')return t;
  }
  return null;
}

export async function openSupplierTab(io,url,active=false) {
  if(!permittedUrl(url))throw Error('supplier_tab_target_invalid');
  const windows=await io.windows();
  const normal=windows.find(w=>w.type==='normal'&&w.focused)||windows.find(w=>w.type==='normal');
  if(normal)return io.createTab({windowId:normal.id,url,active});
  // Chrome can keep the extension alive after its last normal window closes.
  // tabs.create without a window then fails; create one explicit normal window.
  const created=await io.createWindow({url,type:'normal',focused:active});
  const t=created?.tabs?.find(t=>permittedUrl(t.pendingUrl||t.url));
  if(!t)throw Error('supplier_tab_window_unconfirmed');
  return t;
}
