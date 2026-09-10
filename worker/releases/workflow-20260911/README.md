# Workflow-only production release

The live main API contains changes absent from main and differs from the mixed local worktree. This entry point preserves the exact downloaded live Worker (version and SHA-256 in provenance.json) and adds only `/api/workflow/login` and `/api/workflow/save`. All other requests and scheduled handlers delegate to the existing production implementation.

`src/index.js` also includes the workflow router for the next normal source release. Do not use this pinned release for unrelated feature deployment. Reconcile the existing production source before retiring the baseline.

The release config retains the current assets, variables, secrets, R2/D1 bindings, routes, and schedules. Use project-local authority and run migration 0098 before deploying this entry. Do not apply other pending migrations. The baseline contains no deployment credentials.
