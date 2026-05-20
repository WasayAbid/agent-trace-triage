# Agent failure taxonomy

Use this table to classify a failed run **before** changing prompts or models.

| Bucket | ID | Symptom in trace | Fix where |
|--------|-----|------------------|-----------|
| Tool selection | `tool_selection` | Wrong tool; many tools used once | Tool descriptions, merge overlapping tools |
| Tool arguments | `tool_arguments` | Right tool, bad/missing JSON args | JSON Schema, `strict`, examples on fields |
| Tool execution | `tool_execution` | HTTP 4xx/5xx, timeout, auth | API client, retries, error payload to model |
| State / orchestration | `state_orchestration` | Lost result, wrong graph node, stale context | State object, LangGraph edges, message history |
| Recovery policy | `recovery_policy` | Loops, retry storms | `max_iterations`, loop guards, detect-loops in CI |

## 1. Tool selection

**Trace signature:** Tool B runs but the data needed was from tool A; or 6+ different tools each used once.

**Fixes:**
- One capability = one tool. Remove `search` / `find` / `lookup` duplicates.
- Description must include **Use when** and **Do not use when**.
- Cap visible tools (dynamic loading for MCP).

## 2. Tool arguments

**Trace signature:** Tool name correct; API returns 400 validation error; or nulls in required fields.

**Fixes:**
- Every property has `description` + correct `type`.
- Use provider `strict: true` where available.
- Prefer flat schemas; avoid deep nesting.
- Add `examples` on ambiguous fields.

See [tool-schema-audit.md](tool-schema-audit.md).

## 3. Tool execution

**Trace signature:** `error`, `failed`, timeout, or rate-limit in tool span.

**Fixes:**
- Return structured errors: `{ "ok": false, "retryable": true, "message": "..." }`.
- Do not let the model proceed as if `ok: true` on failure.
- Idempotent retries only.

## 4. State & orchestration

**Trace signature:** No loop; tools succeed; final answer still wrong; early tool result ignored later.

**Fixes:**
- Write tool output to explicit state keys; read same keys next step.
- One message per tool result in chat history.
- Log graph node id per step (LangGraph/CrewAI).

## 5. Recovery policy

**Trace signature:** Same tool+args repeated; ping-pong between two tools; many retries with tweaked args.

**Fixes:**
- Run `node scripts/detect-loops.mjs trace.jsonl --json` in CI.
- Abort after 2 identical `callHash` values.
- Require progress metric between retries.

See [loop-patterns.md](loop-patterns.md).
