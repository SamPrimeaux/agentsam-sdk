# SAM P0 integrated baseline — 2026-10-17

This is the result of running the **tracked**
.sam-gap-build/scripts/verify.sh against the reconciled SDK main
integration. It is a verified *foundation test run*, **not** SAM-001..010
completion or an all-language release certification.

- Current integrated HEAD at verification: 50d293ab
- SAM Machine kernel/integration suite: **54/54 passing**
- JavaScript public API contract: **PASS**
- Python public API contract: **PASS**
- Resource CRUD integration: **PASS**
- Source-boundary verification: **PASS**
- Bounded release gates (JS, Python, project CRUD, SQLite CRUD): **PASS**
- Full release certification: **INCOMPLETE** (release_complete: false)
- IAM consent/write-scope alignment (SAM-007): **OPEN**
- Durable complete coding lifecycle/receipt proof (SAM-009): **OPEN**

The complete generated report, catalog and acceptance JSON are retained in
the ignored machine-acceptance/ directory on the Mac. The historical
c37123c2 acceptance JSON is preserved separately under reports/.

Individual ticket reports are not automatically promoted to passing by this
baseline. They require actual positive/negative execution evidence and
independent review before status changes.
