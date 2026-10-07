import {premiumUrl} from './premium-core.mjs';

export const DAILY_CSV_ALARM='supplier-daily-csv';
export const csvName=filename=>(String(filename||'').split(/[\\/]/).pop()||'').match(/^basic_operation_rocket_(\d{8})(\d{8})(?: \(\d+\))?\.csv$/i)?.[0]||'';
export function kstDay(now){return new Date(now+9*3600000).toISOString().slice(0,10);}
export function supplierDownload(item,job){
  if(!csvName(item?.filename)||!job?.requestedAt||Date.parse(item.startTime)<Date.parse(job.requestedAt)-2000)return false;
  try {
    const url=new URL(item.url),ref=item.referrer?new URL(item.referrer):null;
    return premiumUrl(item.referrer)||(url.protocol==='blob:'&&url.origin==='https://supplier.coupang.com')||(!ref&&url.origin==='https://supplier.coupang.com');
  }catch{return false;}
}
// State is persisted before clicks. A restarted worker searches the same request,
// and never re-clicks an ambiguous request merely because no event was observed.
export class DailyCsv {
  constructor(io){this.io=io;this.running=false;}
  async read(){return await this.io.load()||{};}
  async set(job,patch){const next={...job,...patch,checkedAt:new Date(this.io.now()).toISOString()};await this.io.save(next);return next;}
  async tick(){
    if(this.running)return this.read();this.running=true;
    let job=await this.read();
    try {
      const day=kstDay(this.io.now());
      if(job.day===day&&job.stage==='complete') {await this.io.publishStatus();return job;}
      if(job.day!==day){
        const signal=await this.io.signal();
        if(!signal?.ready||signal.day!==day)return job;
        job=await this.set({}, {day,stage:'authentication',reason:'morning_scan_complete',scanCompletedAt:signal.completedAt,scanBrowser:signal.source||null,scanRunId:signal.runId||null,scanSlot:signal.scanSlot||null});
      }
      if(job.stage==='stopped'&&!job.requestedAt&&(await this.io.authState?.())?.status==='connected')job=await this.set(job,{stage:'authentication',authChecks:0,reason:'authentication_restored'});
      if(['stopped','uncertain'].includes(job.stage))return job;
      if(job.stage==='authentication'){
        const auth=await this.io.authenticate();
        if(auth?.status!=='connected'){
          const waiting=['checking','logging_in','connection_error','unverified'].includes(auth?.status);
          const retries=(job.authChecks||0)+1;
          return this.set(job,{stage:waiting&&retries<5?'authentication':'stopped',authChecks:retries,reason:auth?.reason||'authentication_unconfirmed'});
        }
        job=await this.set(job,{stage:'page',reason:'authentication_confirmed'});
      }
      if(job.stage==='page'){
        const page=await this.io.openPage();
        if(page?.status!=='page_opened'){
          const retries=(job.pageChecks||0)+1;
          return this.set(job,{stage:page?.status==='unverified'&&retries<5?'page':'stopped',pageChecks:retries,reason:page?.reason||'csv_page_not_ready'});
        }
        // Arm the durable request before injecting the click, including on a reload.
        job=await this.set(job,{stage:'download',reason:'awaiting_download',requestedAt:new Date(this.io.now()).toISOString()});
        const click=await this.io.click();
        if(!click?.ok)return this.set(job,{stage:'stopped',reason:click?.reason||'csv_click_error'});
      }
      if(job.stage==='download'||job.stage==='validating'){
        const candidates=(await this.io.downloads(job)).filter(item=>supplierDownload(item,job));
        if(candidates.length>1)return this.set(job,{stage:'uncertain',reason:'csv_download_ambiguous'});
        if(!candidates.length){
          if(this.io.now()-Date.parse(job.requestedAt)>20*60000)return this.set(job,{stage:'uncertain',reason:'csv_download_not_observed'});
          return job;
        }
        const item=candidates[0];
        if(item.state==='interrupted')return this.set(job,{stage:'stopped',reason:'csv_download_interrupted'});
        if(item.state!=='complete')return job;
        job=await this.set(job,{stage:'validating',reason:'download_complete',downloadId:item.id});
        const checked=await this.io.validate({filename:item.filename,day:job.day,requestedAt:job.requestedAt});
        if(!checked?.ok)return this.set(job,{stage:'stopped',reason:checked?.reason||'csv_validation_failed'});
        return this.set(job,{stage:'complete',reason:'csv_validated_publish_queued',asOfDate:checked.asOfDate,monthThrough:checked.monthThrough});
      }
      return job;
    }catch{return this.set(job,{reason:'daily_local_connection_error'});}finally{this.running=false;}
  }
}
