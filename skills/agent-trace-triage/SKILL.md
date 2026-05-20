---
name: agent-trace-triage
description: >
  Triages failed AI agent runs from JSON/JSONL traces. Detects tool-call loops
  (repeat, ping-pong, retry-without-progress), classifies failures into five
  buckets, writes a markdown report, and generates regression test stubs.
  Use when the user mentions agent loop, stuck agent, tool calling failure,
  LangGraph/CrewAI trace, Langfuse export, retry storm, or debugging agentic workflows.
disable-model-invocation: true
argument-hint: [trace-file.jsonl]
---

# Agent trace triage

Turn a **failed agent trace file** into: loop detection → failure bucket → fix checklist → regression test.

## Prerequisites

- Trace file path (JSON or JSONL). See [references/trace-formats.md](references/trace-formats.md).
- Node.js 18+ (for bundled scripts; zero npm dependencies).

## Workflow

Copy this checklist and track progress:

```
- [ ] Step 1: Run automated triage scripts
- [ ] Step 2: Read classification + loop findings
- [ ] Step 3: Apply bucket-specific fixes in the codebase
- [ ] Step 4: Write regression test from template
- [ ] Step 5: Confirm clean re-run (no loop in new trace)
```

### Step 1 — Run scripts (required)

Replace `$TRACE` with the user's trace path (`$ARGUMENTS` or ask once).

```bash
node "${CLAUDE_SKILL_DIR}/scripts/detect-loops.mjs" "$TRACE" --json
node "${CLAUDE_SKILL_DIR}/scripts/triage.mjs" "$TRACE" --out .claude/triage-report.md
```

If `$TRACE` is missing, search the repo for `*.jsonl` under `traces/`, `logs/`, `.claude/`, or ask the user to paste export steps from [trace-formats.md](references/trace-formats.md).

**Exit codes:**
- `detect-loops.mjs` → `1` = loop found, `2` = no tool calls
- `triage.mjs` → writes markdown report

Read the JSON from `detect-loops.mjs` first. Do not skip scripts and guess.

### Step 2 — Interpret results

| `classification.bucket` | Read next |
|-------------------------|-----------|
| `recovery_policy` | [loop-patterns.md](references/loop-patterns.md) |
| `tool_execution` | [failure-taxonomy.md](references/failure-taxonomy.md) §3 |
| `tool_selection` | [tool-schema-audit.md](references/tool-schema-audit.md) |
| `tool_arguments` | [tool-schema-audit.md](references/tool-schema-audit.md) |
| `state_orchestration` | [failure-taxonomy.md](references/failure-taxonomy.md) §4 |
| `unknown` | [trace-formats.md](references/trace-formats.md) |

Present the user:
1. **What failed** (1 sentence from `classification.summary`)
2. **First bad step index** (from earliest `loops[].startIndex` or last error step)
3. **Top 3 fixes** from recommendations (repo-specific detail added by you)

### Step 3 — Fix in code (minimal scope)

Rules:
- Fix **one bucket** at a time; do not rewrite the whole agent.
- For loops: add guards (`max_iterations`, duplicate `callHash` detection) in the **orchestrator**, not only prompt tweaks.
- For tool errors: fix API/client before prompt changes.
- For selection/args: edit tool schemas; merge overlapping tools.

Locate files: `**/agent*.py`, `**/tools/**`, `**/graph*.py`, `**/*langgraph*`, `**/*crew*`, router nodes, retry handlers.

### Step 4 — Regression test

1. Detect test runner: `pytest` → `templates/regression-test.py.template`, else `vitest`/`jest` → `regression-test.ts.template`.
2. Copy template to `tests/agent_regressions/test_<incident_id>.py` (or `.test.ts`).
3. Replace `{{INCIDENT_ID}}`, `{{TRACE_FILE}}`, `{{BUCKET}}`, `{{SAMPLE_USER_PROMPT}}`.
4. Implement the `TODO` behavior assertion for this incident.

### Step 5 — Verify

Ask the user to re-run the agent and export a new trace. Re-run:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/detect-loops.mjs" "$NEW_TRACE" --json
```

Success = `"hasLoop": false` and bucket no longer `recovery_policy` for the same scenario.

Optional CI (document in PR):

```bash
node skills/agent-trace-triage/scripts/detect-loops.mjs traces/latest.jsonl --json
```

## Output format for the user

```markdown
## Triage summary
- **Trace:** ...
- **Bucket:** ...
- **Loop:** yes/no
- **First bad step:** ...

## Root cause
...

## Fixes applied
1. ...

## Regression test
- `tests/agent_regressions/...`

## Re-verify
Run agent again; export trace; `/agent-trace-triage <new-trace>`
```

## When trace has no tool calls

Do not invent a diagnosis. Tell the user to add JSONL logging per [trace-formats.md](references/trace-formats.md) § Minimum instrumentation, re-run once, then invoke this skill again.

## Additional resources

- [failure-taxonomy.md](references/failure-taxonomy.md)
- [loop-patterns.md](references/loop-patterns.md)
- [trace-formats.md](references/trace-formats.md)
- [tool-schema-audit.md](references/tool-schema-audit.md)
