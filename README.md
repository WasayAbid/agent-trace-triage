# Agent Trace Triage

**Claude Code plugin** that debugs failed AI agent runs from a trace file (JSON/JSONL).

When your agent loops, picks the wrong tool, or burns tokens for no reason, this skill:

1. **Parses** your trace (LangChain, OpenAI tool_calls, custom JSONL, partial OTEL)
2. **Detects loops** deterministically (repeat, ping-pong, retry-without-progress)
3. **Classifies** the failure into a fixable bucket
4. **Writes** a markdown triage report
5. **Scaffolds** a regression test so the bug does not come back

No npm dependencies. Node.js 18+ only.

---

## Quick start

### Install as a project plugin

Clone into your repo or add as submodule, then in Claude Code:

Or copy the skill only:

```bash
cp -r skills/agent-trace-triage ~/.claude/skills/agent-trace-triage
```

### Export a trace

Use the simplest format (one JSON object per line):

```jsonl
{"type":"tool_call","tool":"my_tool","arguments":{"id":1},"status":"ok"}
```

See [skills/agent-trace-triage/references/trace-formats.md](skills/agent-trace-triage/references/trace-formats.md).

### Run in Claude Code

```text
/agent-trace-triage traces/my-failed-run.jsonl
```

Claude will run the bundled scripts and fix your agent code.

### Run scripts locally (no Claude)

```bash
npm test
npm run loops:example
npm run triage:example
```

Or directly:

```bash
node skills/agent-trace-triage/scripts/detect-loops.mjs examples/sample-failed-trace.jsonl --json
node skills/agent-trace-triage/scripts/triage.mjs examples/sample-failed-trace.jsonl --out triage-report.md
```

---

## What gets detected

| Pattern | Meaning |
|---------|---------|
| `direct_repeat` | Same tool + same args 3+ times in a row |
| `ping_pong` | Two tools alternating with no progress |
| `retry_without_progress` | Same tool, many arg variants, no convergence |

| Failure bucket | Typical fix |
|----------------|-------------|
| `recovery_policy` | Max iterations, loop guards, stop on duplicate results |
| `tool_execution` | Auth, timeouts, rate limits, structured errors |
| `tool_selection` | Fewer tools, clearer descriptions |
| `tool_arguments` | JSON Schema, strict mode, examples |
| `state_orchestration` | Agent state, graph edges, message history |

---

## Repository layout

```text
.claude-plugin/plugin.json          # Plugin manifest
skills/agent-trace-triage/
  SKILL.md                          # /agent-trace-triage command
  scripts/                          # parse, detect-loops, triage (Node)
  references/                       # Taxonomy, formats, schema audit
  templates/                        # Regression test stubs
tests/                              # Automated tests + fixtures
examples/sample-failed-trace.jsonl
```

---

## Publish to Claude plugin directory

1. Push this repo to **public** GitHub.
2. Update `homepage` in `.claude-plugin/plugin.json`.
3. Run `claude plugin validate` from repo root (requires Claude Code CLI).
4. Submit: [claude.ai/settings/plugins/submit](https://claude.ai/settings/plugins/submit)

---

## CI example

```yaml
- name: Agent trace regression
  run: |
    node skills/agent-trace-triage/scripts/detect-loops.mjs traces/latest.jsonl --json
```

Exit code `1` = loop still present (fail build).

---

## Limitations (honest)

- Requires a trace with **tool name + arguments**. Chat-only logs are not enough.
- Classification heuristics are conservative; Claude applies repo-specific fixes in Step 3.
- Does not replace Langfuse/Datadog — it **uses** their exports when you provide them.

---

## License

MIT — see [LICENSE](LICENSE).
