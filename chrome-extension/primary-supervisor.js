// Read-only liveness checks plus one bounded retry; never restart a browser.
async function runPrimarySupervisor(api,request,{verify=false,release}={}) {
  if(!/^\d+\.\d+\.\d+$/.test(release||''))throw Error('primary-release-missing');
  const identity={scanSlot:request.scanSlot,requestId:request.requestId,policyId:scanPolicyForSlot(request.scanSlot).id};
  const send=(type,extra={})=>api.send({type,...identity,...extra});
  const start=retry=>send('RUN_PRIMARY_SCAN',{products:request.targets,requestedAt:request.requestedAt,retry});
  const deadline=primaryScanDeadline(request.requestedAt,request.scanSlot);
  const emit=(status,state={},reason=null)=>api.emit({version:1,browser:'whale',...identity,status,at:new Date(api.now()).toISOString(),deadlineAt:new Date(deadline).toISOString(),targetCount:request.targets.length,launchAttempt:request.launchAttempts||0,...state,reason});
  if(verify) {
    const result=await send('CHECK_PRIMARY_TRANSPORT',{products:request.targets});
    await emit(result?.ok&&result.version===release?'transport-verified':'rejected',{workerVersion:result?.version||null},result?.reason||null);return;
  }
  if(api.now()>=deadline){await emit('deadline-exhausted',{},'primary-recovery-budget-exhausted');return;}
  let result=await start(false),stopAt=null,lastState=null,observedRunningAt=null;
  const recoverable=['interrupted-retry-required','request-pending','already-running','busy-unrelated','retry-exhausted','edge-handoff-started'];
  if(!result?.ok&&!recoverable.includes(result?.reason)){await emit('rejected',{},result?.reason||'start-response-missing');return;}
  await emit(result?.ok?'accepted':'checking',{},result?.reason||null);
  while(api.now()<deadline) {
    const state=await send('GET_PRIMARY_STATE');
    lastState=state;
    if(!state?.ok||state.workerVersion!==release){await emit('state-unavailable',{},state?.reason||'state-response-missing');return;}
    if(state.completed){await emit('complete',state);return;}
    if(state.handoff){await emit('edge-ready',state);return;}
    if(state.running) {
      if(state.requestRunning) {
        // The original request fixes the deadline, not this attempt's liveness.
        // Before the first progress write, a delayed start/retry is still fresh.
        if(observedRunningAt===null)observedRunningAt=api.now();
        const attemptAt=Date.parse(state.attemptStartedAt);
        const progressAt=Date.parse(state.progress?.updatedAt);
        const changed=Number.isFinite(attemptAt)
          ? Math.max(attemptAt,Number.isFinite(progressAt)?progressAt:attemptAt)
          : (Number.isFinite(progressAt)?progressAt:observedRunningAt);
        if(api.now()-changed>=6*60000&&!stopAt){const stopped=await send('STOP_PRIMARY_SCAN');if(!stopped?.ok){await emit('stalled-unconfirmed',state,'stop-not-acknowledged');return;}stopAt=api.now();}
        if(stopAt!==null&&api.now()-stopAt>=120000){await emit('stalled-unconfirmed',state,'worker-did-not-stop');return;}
      }
      await emit(stopAt===null?'running':'stopping',state);
    } else if(state.requestExists) {
      stopAt=null;observedRunningAt=null;
      if(state.retryCount<1) {
        result=await start(true);
        if(!result?.ok){await emit('rejected',state,result?.reason||'retry-response-missing');return;}
        await emit('retry-started',state);
      } else {
        const handoff=await send('PREPARE_PRIMARY_HANDOFF');
        await emit(handoff?.ok&&handoff.handoff?'edge-ready':'rejected',handoff||{},handoff?.reason||null);return;
      }
    } else {await emit('rejected',state,'request-state-missing');return;}
    await api.wait(15000);
  }
  if(lastState?.requestRunning)await send('STOP_PRIMARY_SCAN');
  await emit('deadline-exhausted',{},'primary-recovery-budget-exhausted');
}

