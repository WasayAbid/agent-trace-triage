# Install guide

## Option A — Project plugin (team)

1. Add this repo to your project (submodule or copy).
2. In Claude Code:

   ```text
   /plugin marketplace add ./path-to/Cluade-Code-Skill
   /plugin install agent-trace-triage@agent-trace-triage-marketplace
   ```

3. Invoke:

   ```text
   /agent-trace-triage path/to/trace.jsonl
   ```

## Option B — Personal skill (solo)

```bash
# macOS / Linux
cp -r skills/agent-trace-triage ~/.claude/skills/agent-trace-triage

# Windows (PowerShell)
Copy-Item -Recurse skills\agent-trace-triage $env:USERPROFILE\.claude\skills\agent-trace-triage
```

Restart Claude Code if the skills folder did not exist before.

## Option C — Scripts only (CI / no Claude)

```bash
node skills/agent-trace-triage/scripts/detect-loops.mjs traces/run.jsonl --json
```

Exit `0` = no loop, `1` = loop detected, `2` = parse error.

## Requirements

- Node.js 18+
- Trace file in JSON or JSONL (see `skills/agent-trace-triage/references/trace-formats.md`)
