# Loop patterns

`detect-loops.mjs` flags three patterns. Match the finding `type` to the fix.

## direct_repeat

Same **tool name** + identical **arguments** N times (default N≥3).

**Common causes:**
- Retry loop that ignores unchanged tool output
- Missing exit condition when result is empty
- Model told to "try again" without changing inputs

**Fixes:**
- If `result === previous_result`, stop or escalate
- Cap `max_same_tool_calls = 2`
- Pass prior result hash into prompt: "do not repeat call X"

## ping_pong

Alternating **callHash A** and **callHash B** for 2+ cycles (e.g. A→B→A→B).

**Common causes:**
- Tool A invalidates tool B output and vice versa
- Two tools with overlapping responsibility

**Fixes:**
- Merge into one tool with a `mode` parameter
- Orchestrator chooses one path; disable the other tool mid-run
- Store combined state after A before calling B

## retry_without_progress

Same **tool name**, different args, many times in a short window.

**Common causes:**
- Model tweaking query hoping for different DB rows
- No validation that output improved

**Fixes:**
- Compare result fingerprint between retries
- Shrink parameter search space in prompt
- Fail fast after K attempts and ask the user

## Severity

| Severity | Meaning |
|----------|---------|
| critical | ≥5 identical repeats or ≥3 ping-pong cycles |
| high | Default thresholds met |
| medium | retry_without_progress only |
