# Trace formats

Scripts accept **JSON** or **JSONL** (one JSON object per line). Each record should expose tool calls using any of the shapes below.

## Recommended: simple JSONL (easiest)

One line per tool call:

```jsonl
{"type":"tool_call","tool":"search_database","arguments":{"query":"user@example.com"},"step":1,"status":"ok"}
{"type":"tool_call","tool":"search_database","arguments":{"query":"user@example.com"},"step":2,"status":"ok"}
{"type":"tool_call","tool":"update_ticket","arguments":{"id":42,"status":"open"},"step":3,"status":"error","error":"404 Not Found"}
```

Field aliases supported: `tool` / `tool_name` / `name`, `arguments` / `args` / `input`.

## OpenAI-style messages export

```json
{
  "messages": [
    {
      "role": "assistant",
      "tool_calls": [
        {
          "function": { "name": "get_weather", "arguments": "{\"city\":\"Paris\"}" }
        }
      ]
    }
  ]
}
```

## LangSmith-style (partial)

Nested `runs` / `child_runs` with `tool_calls` or `type: "tool"` events are walked automatically.

## OpenTelemetry-style spans

```json
{
  "spans": [
    {
      "name": "execute_tool.search",
      "input": { "query": "test" },
      "status": "ok"
    }
  ]
}
```

## Minimum instrumentation (if you have no trace yet)

Add in your agent loop after each tool execution:

```python
import json

def log_tool(trace_path: str, name: str, arguments: dict, status: str, error: str | None = None):
    record = {
        "type": "tool_call",
        "tool": name,
        "arguments": arguments,
        "status": status,
    }
    if error:
        record["error"] = error
    with open(trace_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, default=str) + "\n")
```

Then run:

```bash
node scripts/triage.mjs traces/run.jsonl --out triage-report.md
```

## Export tips

| Platform | Export approach |
|----------|-----------------|
| Custom loop | Append JSONL as above |
| LangChain | Enable debug logging; convert runs to JSONL |
| Langfuse | Export run JSON; save as `.json` |
| Manual | Copy tool steps from logs into JSONL |

If parsing warns **No tool calls found**, fix the export — do not guess from chat alone.
