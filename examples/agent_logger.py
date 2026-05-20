"""
Minimal trace logger for /agent-trace-triage.
Append one JSON line per tool call, then triage with Claude Code or:

  node skills/agent-trace-triage/scripts/triage.mjs traces/run.jsonl
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def log_tool_call(
    trace_path: str | Path,
    tool: str,
    arguments: dict[str, Any],
    *,
    status: str = "ok",
    error: str | None = None,
    step: int | None = None,
) -> None:
    record: dict[str, Any] = {
        "type": "tool_call",
        "tool": tool,
        "arguments": arguments,
        "status": status,
    }
    if error:
        record["error"] = error
    if step is not None:
        record["step"] = step
    path = Path(trace_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, default=str) + "\n")


if __name__ == "__main__":
    demo = Path(__file__).parent / "demo-trace.jsonl"
    if demo.exists():
        demo.unlink()
    log_tool_call(demo, "demo_tool", {"hello": "world"}, step=1)
    print(f"Wrote {demo}")
