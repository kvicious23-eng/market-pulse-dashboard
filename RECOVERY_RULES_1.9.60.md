# 1.9.59 process audit and 1.9.60 safeguards

The approved Chrome 40-second experiment remains November 3–9, at 08:00 and 16:00 KST; November 10 returns to 20 seconds. The wait retains its full duration and local liveness API calls. No product visits, access retries, account/profile changes or extra collection runs are added.

| Finding | Corrected behavior |
|---|---|
| Any old Edge receipt suppressed the new worker probe | Only a matching current-slot receipt suppresses duplicate handoff |
| Inactivity could be mistaken for a restarted worker | The original persisted worker instance ID must differ from the current instance ID |
| Initial or final progress boundaries were not recoverable consistently | Persist starting progress with the run witness; accept completed counts from zero through the target count before a saved completion |
| Another request could enter during asynchronous freeze persistence | Hold the existing pending-operation guard; persist a same-slot handoff that prevents later primary restarts |
| A 403 stop or existing save-recovery could be reclassified | Those run-specific owners retain priority; no substitute worker proof bypasses their validation |
| A result could finish downloading after the first completion check | Recheck matching complete production output immediately before Edge handoff |
| A dead probe page could remain open indefinitely | Bound probe APIs, validate the downloaded path, and close only the probe's own tab |
| A failed output save could look like a successful cadence result | Record saved completion separately from access stop or interrupted/failed completion |
| The default 75-minute watchdog could end before a valid original collection deadline | After a verified 1.9.60 start witness, monitor only until that original deadline; never renew collection time |
| A wait could consume time beyond the remaining budget | Bound each wait segment by the inherited remaining time; never renew a deadline |

The probe requires the exact run, KST slot, full catalog, original start/deadline, fresh nonce-bound evidence, valid integer progress and no active/pending collection. Unknown or missing evidence never triggers an inferred handoff. Frozen primary runs remain blocked across worker restarts. Interruption metadata contains progress/cadence only, not partial prices or a fabricated network request count.

Validation covers idle lifecycle simulation, short remaining budgets and liveness API failure; freeze race exclusion; starting, final-product, retry and download stages; worker-instance identity; access-stop/save-recovery ownership; timeout/path cleanup; and the real isolated Windows probe-to-Edge-to-publication selection with duplicate and negative cases. All existing Windows, LF and CRLF regression checks remain required.

Installation checks and synthetic tests do not prove future natural 40-second collection or natural automatic worker recovery. The earlier 1.9.59 operator-assisted recovery is distinct from the new automatic path. This change does not resolve third-party HTTP 403 restrictions or make incomplete checkout prices verified.
