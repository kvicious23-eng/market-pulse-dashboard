// Only the internal resume page invokes this; local Native validation owns trust.
export async function resumeAfterEdge(message,io) {
  if(!/^[a-p]{32}$/.test(message.priceId||'')||!/^[a-f0-9]{32}$/.test(message.runId||''))return {ok:false,reason:'invalid_resume_request'};
  const signal=await io.signal();
  if(signal?.version!==2||!signal.ready||signal.source!=='edge'||signal.scanSlot!==message.scanSlot||signal.runId!==message.runId)return {ok:false,reason:'edge_morning_signal_unconfirmed'};
  let acknowledgement;
  try {acknowledgement=await io.acknowledge(message.priceId,signal);}catch{acknowledgement={ok:false,reason:'price_extension_unavailable'};}
  const job=await io.tick();
  return {ok:true,acknowledgement,stage:job?.stage,reason:job?.reason};
}
