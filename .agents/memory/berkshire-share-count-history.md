---
name: Berkshire share-count history
description: How to recover Berkshire outstanding-share history when aggregate SEC Company Facts are stale.
---

Berkshire's recent outstanding-share counts are class-dimensioned filing facts, not reliable aggregate Company Facts. Read both Class A and Class B cover-page facts and convert them to the viewed share class using 1 Class A = 1,500 Class B.

**Why:** The aggregate `EntityCommonStockSharesOutstanding` series ends years before the current chart, while filing-level XBRL continues to report both classes. SEC XBRL archives changed from traditional XML instances to inline-XBRL HTML over the history.

**How to apply:** Use compact filing XBRL ZIPs and support both XML and inline HTML facts. Attach each cover-page count to its filing report period, then estimate issuance from adjacent equivalent-share movement plus repurchases when direct issuance facts are absent.