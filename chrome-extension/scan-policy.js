// Shared policy: Windows parses only the marked JSON; no executable evaluation.
const SCAN_ROUTING_POLICY = /* ROUTING_JSON_BEGIN */
{
  "version": 1,
  "slots": ["08:00", "12:00", "16:00", "20:00"],
  "changes": [
    {"from":"1970-01-01T08:00+09:00","id":"chrome-four-v1","owners":["chrome","chrome","chrome","chrome"]},
    {"from":"2026-10-21T12:00+09:00","id":"whale-noon-v1","owners":["chrome","whale","chrome","chrome"]},
    {"from":"2026-10-26T20:00+09:00","id":"whale-noon-evening-v1","owners":["chrome","whale","chrome","whale"]}
  ]
}
/* ROUTING_JSON_END */;
function scanPolicyForSlot(slot) {
  if(!/^\d{4}-\d{2}-\d{2}T(08|12|16|20):00\+09:00$/.test(slot||''))throw Error('invalid-scan-slot');
  const at=Date.parse(slot);
  if(!Number.isFinite(at)||new Date(at+9*3600000).toISOString().slice(0,16)!==slot.slice(0,16))throw Error('invalid-scan-slot-date');
  if(SCAN_ROUTING_POLICY.version!==1||SCAN_ROUTING_POLICY.slots.join(',')!=='08:00,12:00,16:00,20:00')throw Error('invalid-routing-policy');
  let previous='',policy=null;
  for(const row of SCAN_ROUTING_POLICY.changes) {
    if(row.from<=previous||!row.id||row.owners.length!==4||row.owners.some(x=>!['chrome','whale'].includes(x)))throw Error('invalid-routing-policy');
    previous=row.from;if(row.from<=slot)policy=row;
  }
  if(!policy)throw Error('missing-routing-policy');
  return {id:policy.id,browser:policy.owners[SCAN_ROUTING_POLICY.slots.indexOf(slot.slice(11,16))]};
}
function scanSlotKey(slot) {scanPolicyForSlot(slot);return slot.slice(0,16).replace(/\D/g,'');}
function nextScheduledScanTime(slot) {scanPolicyForSlot(slot);return Date.parse(slot)+(slot.slice(11,13)==='20'?12:4)*3600000;}
function primaryScanDeadline(requestedAt,slot) {
  const start=Date.parse(requestedAt);
  if(!Number.isFinite(start))throw Error('invalid-request-time');
  const nightEnd=slot.slice(11,13)==='20'?Date.parse(slot.slice(0,10)+'T22:20+09:00'):Infinity;
  return Math.min(start+120*60000,nextScheduledScanTime(slot),nightEnd);
}
function primaryReceiptBase(receipt,verify=false) {
  const prefix=verify?'whale-primary-transport-check':'whale-primary-acceptance';
  if(!/^[a-f0-9]{32}$/.test(receipt.requestId||''))return prefix;
  return `${prefix}-${scanSlotKey(receipt.scanSlot)}-${receipt.requestId}`;
}
function primaryWitnessFilename(slot,id) {
  if(!/^[a-f0-9]{32}$/.test(id||''))throw Error('invalid-primary-id');
  return `MarketPulse/whale-scan-start-${scanSlotKey(slot)}-${id}.json`;
}
