# CLU Store API — Planning Deliverables

This is a **read-only design and implementation-planning package**, prepared on 2026-10-19 for:

- Backend: https://github.com/Shaobangzhu/clu-store-api
- Frontend: https://github.com/Shaobangzhu/clu-store-client

No repository source, database schema, Docker Compose runtime, GitHub PR, or deployment was modified or executed by this package.

## Contents

- `01_SOURCE_AUDIT.md` — exact inventory of seven supplied inputs, 17 original routes, current GitHub repo state, frontend incompatibilities and security issues.
- `02_ARCHITECTURE_AND_API_CONTRACT.md` — tech/version decisions, database relations, pricing and order semantics, endpoint/response contract, Docker architecture, security gates.
- `03_IMPLEMENTATION_ROADMAP.md` — 14-phase milestone plan, GPT model and Thinking effort matrix, dependencies and acceptance criteria.
- `04_CODEX_PROMPTS.md` — complete P00–P13 copy/paste instructions, written in English for a coding agent.
- `prompts/` — one Markdown file per implementation prompt, convenient for executing only the current phase.

## Execution

1. Open the **local** repo, not only remote GitHub. Compare its `git status` with the remote view and read any `AGENTS.md`.
2. Provide the planning Markdown files (and the seven original inputs separately when needed) to Codex, but **do not commit the unsanitized Postman collection**.
3. Execute `prompts/P00_*.md`, verify before `P01`, and continue one phase at a time.
4. Use local Docker PostgreSQL; no cloud DB, no automatic push/PR/deploy.

**Material safety:** the uploaded original Postman contains bearer token-like strings and old server endpoints. No original tokens/IPs are copied into this deliverable package. Rebuilt Postman is scheduled only for P09.

**Important distinction:** the backend remote repository has only README and .gitignore; the developer's actual local working tree, Docker containers, and local Git modifications have **not** been inspected. Those checks are deliberately the first task of P00/P02.
