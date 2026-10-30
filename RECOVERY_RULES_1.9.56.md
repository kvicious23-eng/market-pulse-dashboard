# Recovery audit update — 1.9.56

This release keeps the existing early-stop and full-recollection policy.

- If saving the stop evidence fails, try one unique alternate filename without collecting another product. Matching duplicate proofs are accepted; corrupt or conflicting proofs do not authorize recovery. Preserve the stopped primary and avoid publishing partial prices when both writes fail.
- Send the stop evidence before storing the general diagnostic archive, while still attempting that archive if evidence delivery fails.
- Use the shared dated browser-ownership policy for diagnostic summaries. Include scheduled Whale evening runs and distinguish unattempted products from observed failures.
- Retire unfinished recovery queues when the next regular collection slot begins. Preserve the original collection/publication deadlines and the maximum of two selective follow-up attempts.
- Keep the existing deployment-success and waiting-interval gates, identity/catalog validation, verified-row preservation, and exclusion of authentication or integrity errors from the second selective attempt.

Regression checks cover both primaries, alternate evidence delivery, conflicting proofs, historical/evening routing, unattempted counts, and retirement of stale publication queues. Installation checks do not establish success of a future live failure recovery.
