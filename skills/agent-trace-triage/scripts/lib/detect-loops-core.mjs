/**
 * @typedef {import('./parse-trace-core.mjs').ToolCallRecord} ToolCallRecord
 */

/**
 * @typedef {'direct_repeat'|'ping_pong'|'retry_without_progress'|'none'} LoopType
 */

/**
 * @typedef {object} LoopFinding
 * @property {LoopType} type
 * @property {string} severity
 * @property {string} message
 * @property {number} startIndex
 * @property {number} endIndex
 * @property {string[]} involvedTools
 * @property {string[]} involvedHashes
 * @property {object} evidence
 */

const DEFAULTS = {
  directRepeatThreshold: 3,
  pingPongThreshold: 2,
  retrySameToolThreshold: 5,
  windowSize: 12,
};

/**
 * @param {Array<ToolCallRecord>} toolCalls
 * @param {object} options
 */
export function detectLoops(toolCalls, options = {}) {
  const config = { ...DEFAULTS, ...options };
  /** @type {LoopFinding[]} */
  const findings = [];

  if (toolCalls.length < config.directRepeatThreshold) {
    return { findings, hasLoop: false };
  }

  // 1) Direct repeat — same callHash N times in a row
  let runStart = 0;
  for (let i = 1; i <= toolCalls.length; i += 1) {
    const prev = toolCalls[i - 1];
    const curr = toolCalls[i];
    const broken = !curr || curr.callHash !== prev.callHash;
    if (broken) {
      const runLength = i - runStart;
      if (runLength >= config.directRepeatThreshold) {
        const slice = toolCalls.slice(runStart, i);
        findings.push({
          type: 'direct_repeat',
          severity: runLength >= 5 ? 'critical' : 'high',
          message: `Tool "${slice[0].toolName}" called ${runLength} times with identical arguments.`,
          startIndex: runStart,
          endIndex: i - 1,
          involvedTools: [slice[0].toolName],
          involvedHashes: [slice[0].callHash],
          evidence: {
            callHash: slice[0].callHash,
            repeatCount: runLength,
            sampleArgs: slice[0].args,
          },
        });
      }
      runStart = i;
    }
  }

  // 2) Ping-pong — A-B-A-B (at least 2 full cycles = 4 calls)
  const minPingPong = config.pingPongThreshold * 2;
  for (let i = 0; i + minPingPong - 1 < toolCalls.length; i += 1) {
    const a = toolCalls[i].callHash;
    const b = toolCalls[i + 1]?.callHash;
    if (!b || a === b) {
      continue;
    }
    let cycles = 0;
    let j = i;
    while (j + 1 < toolCalls.length) {
      const h0 = toolCalls[j].callHash;
      const h1 = toolCalls[j + 1].callHash;
      if (h0 === a && h1 === b) {
        cycles += 1;
        j += 2;
      } else {
        break;
      }
    }
    if (cycles >= config.pingPongThreshold) {
      const endIndex = i + cycles * 2 - 1;
      findings.push({
        type: 'ping_pong',
        severity: cycles >= 3 ? 'critical' : 'high',
        message: `Ping-pong between "${toolCalls[i].toolName}" and "${toolCalls[i + 1].toolName}" for ${cycles} cycles.`,
        startIndex: i,
        endIndex,
        involvedTools: [toolCalls[i].toolName, toolCalls[i + 1].toolName],
        involvedHashes: [a, b],
        evidence: { cycles, hashA: a, hashB: b },
      });
      i = endIndex;
    }
  }

  // 3) Retry without progress — same tool, different args, many times in window
  const byToolWindow = new Map();
  for (const call of toolCalls) {
    if (!byToolWindow.has(call.toolName)) {
      byToolWindow.set(call.toolName, []);
    }
    const list = byToolWindow.get(call.toolName);
    list.push(call);
    if (list.length > config.windowSize) {
      list.shift();
    }
    if (list.length >= config.retrySameToolThreshold) {
      const uniqueHashes = new Set(list.map((item) => item.argsHash));
      if (uniqueHashes.size > 1 && uniqueHashes.size < list.length) {
        const already = findings.some(
          (f) =>
            f.type === 'retry_without_progress' &&
            f.involvedTools[0] === call.toolName &&
            f.endIndex >= call.index - 1,
        );
        if (!already) {
          findings.push({
            type: 'retry_without_progress',
            severity: 'medium',
            message: `Tool "${call.toolName}" invoked ${list.length} times in a short window with varying arguments (possible non-convergence).`,
            startIndex: call.index - list.length + 1,
            endIndex: call.index,
            involvedTools: [call.toolName],
            involvedHashes: [...uniqueHashes],
            evidence: {
              windowSize: list.length,
              uniqueArgVariants: uniqueHashes.size,
            },
          });
        }
      }
    }
  }

  const deduped = dedupeFindings(findings);
  return { findings: deduped, hasLoop: deduped.length > 0 };
}

/**
 * @param {LoopFinding[]} findings
 */
function dedupeFindings(findings) {
  const seen = new Set();
  const out = [];
  for (const finding of findings.sort((a, b) => a.startIndex - b.startIndex)) {
    const key = `${finding.type}:${finding.startIndex}:${finding.endIndex}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(finding);
  }
  return out;
}

/**
 * Heuristic failure bucket from trace + loops
 * @param {Array<ToolCallRecord>} toolCalls
 * @param {LoopFinding[]} loopFindings
 */
export function classifyFailure(toolCalls, loopFindings) {
  if (toolCalls.length === 0) {
    return {
      bucket: 'unknown',
      confidence: 'low',
      summary: 'No tool calls in trace. Cannot triage — add instrumentation first.',
      recommendations: [
        'Log each tool call with name + JSON arguments + result status.',
        'Re-run and pass the new trace file to /agent-trace-triage.',
      ],
    };
  }

  if (loopFindings.length > 0) {
    const primary = loopFindings[0];
    return {
      bucket: 'recovery_policy',
      confidence: 'high',
      summary: `Recovery policy failure: ${primary.message}`,
      recommendations: getRecoveryRecommendations(primary),
      primaryLoop: primary,
    };
  }

  const errors = toolCalls.filter((call) => call.error || call.status === 'error' || call.status === 'failed');
  if (errors.length > 0) {
    const last = errors[errors.length - 1];
    return {
      bucket: 'tool_execution',
      confidence: 'high',
      summary: `Tool execution failure at step ${last.index}: "${last.toolName}" — ${last.error ?? 'error status'}.`,
      recommendations: [
        'Fix auth, timeout, rate limits, or API errors before changing prompts.',
        'Add retries with exponential backoff only for idempotent tools.',
        'Surface tool errors to the model as structured JSON (status, message, retryable).',
      ],
    };
  }

  const unknownTools = toolCalls.filter((call) => call.toolName === 'unknown_tool');
  if (unknownTools.length > toolCalls.length * 0.3) {
    return {
      bucket: 'unknown',
      confidence: 'medium',
      summary: 'Trace format is partial — many tool names could not be parsed.',
      recommendations: [
        'Export traces using references/trace-formats.md (simple JSONL recommended).',
      ],
    };
  }

  // Heuristic: many different tools with single use might be wrong selection wandering
  const freq = new Map();
  for (const call of toolCalls) {
    freq.set(call.toolName, (freq.get(call.toolName) ?? 0) + 1);
  }
  const unique = freq.size;
  const total = toolCalls.length;
  if (unique >= 6 && total >= 8 && Math.max(...freq.values()) <= 2) {
    return {
      bucket: 'tool_selection',
      confidence: 'medium',
      summary: 'Many different tools used once each — possible tool-selection confusion.',
      recommendations: [
        'Reduce overlapping tools; merge similar tools into one with a mode parameter.',
        'Improve tool descriptions with WHEN and WHEN NOT.',
        'See references/tool-schema-audit.md',
      ],
    };
  }

  return {
    bucket: 'state_orchestration',
    confidence: 'medium',
    summary:
      'No loop or explicit tool error detected. Likely wrong state, lost tool result, or bad graph routing.',
    recommendations: [
      'Compare the first wrong output step to the previous tool result in the trace.',
      'Persist tool outputs in agent state; verify the next step reads the same field.',
      'Add a span per graph node (LangGraph/CrewAI) to see skipped or repeated nodes.',
    ],
  };
}

/**
 * @param {import('./detect-loops-core.mjs').LoopFinding} finding
 */
function getRecoveryRecommendations(finding) {
  const common = [
    'Add max_iterations / max_tool_calls guard in the agent loop.',
    'Stop when the same callHash appears 2 times (use scripts/detect-loops.mjs in CI).',
  ];
  if (finding.type === 'direct_repeat') {
    return [
      ...common,
      'Treat identical tool results as terminal: if result unchanged, escalate to user or switch strategy.',
      'Fix retry logic that does not inspect prior result.',
    ];
  }
  if (finding.type === 'ping_pong') {
    return [
      ...common,
      'Two tools are fighting — merge them or add explicit precedence rules in the system prompt.',
      'Pass consolidated state so tool B sees tool A output without re-calling A.',
    ];
  }
  return [
    ...common,
    'Require measurable progress signal between retries (e.g. result count, status flag).',
    'Narrow tool parameters on each retry instead of random variation.',
  ];
}
