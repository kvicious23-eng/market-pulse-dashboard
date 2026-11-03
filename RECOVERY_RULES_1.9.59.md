# Worker lifecycle recovery — 1.9.59

Chrome scheduled collection retains the approved November 3–9 40-second cadence. The wait uses two 20-second segments and a bounded, local extension API call to keep the service worker alive; it adds no product/network visits and does not extend the original deadline.

A Chrome-only internal probe may freeze and report a confirmed inactive scheduled worker. A valid saved start witness, matching run/slot/catalog/deadline, fresh nonce-bound evidence, no active or pending collection, and no completed result are required. Missing files, stale progress or a live browser process alone never prove interruption. The watchdog and uploader share rate limiting and the existing Edge handoff mutex. A verified interruption triggers one full Edge recollection under the inherited time budget. Prices from the interrupted partial run are never published.

The probe does not infer Akamai or HTTP 403. Whale, supplier collection, normal price calculations and the November 10 return to 20 seconds retain their existing rules. Synthetic lifecycle checks, rollout verification and natural execution outcomes are separate evidence.
