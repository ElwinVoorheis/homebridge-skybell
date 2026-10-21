# homebridge-skybell — Constitution

> The non-negotiable rules. Every RFC, spec and pull request is checked against this. If a
> change conflicts with it, stop and say so — amend it deliberately instead of working around it.
> Keep it short: a rule that cannot be checked is a wish.

**Version:** 1.0.0 · **Ratified:** 2026-10-18

## Principles
1. Spec before code — no gateway code without an approved spec.
2. Test first — every behaviour lands with a test written before it (red, then green).
3. Core depends on abstractions — server `core/` never imports `connectors/` or Node I/O modules.
4. New media kinds or sources are added as new modules, not by editing existing adapters.
5. Strict types — `strict: true`; no `any` without a comment explaining why.

## Guardrails (things that must never happen)
- No credentials, tokens or SRTP keys in code, logs or committed files.
- No edits to the legacy plugin files as part of gateway work.
- No shell string building for FFmpeg — arguments are passed as an array (no injection).
- No unvalidated request input reaches a connector (validate with a schema at the edge).

## Quality gates (what "done" means)
- Format, lint, type check and tests pass (`groundwork.py verify`).
- Each acceptance criterion in the spec has a test.

## Amendments
_None yet._
