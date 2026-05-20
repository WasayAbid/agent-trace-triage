import { createHash } from 'node:crypto';
import { normalizeToolArgs, stableStringify } from './stable-json.mjs';

const TOOL_NAME_KEYS = ['tool', 'tool_name', 'toolName', 'name', 'function', 'function_name'];
const ARGS_KEYS = ['arguments', 'args', 'input', 'parameters', 'params', 'tool_input'];

/**
 * @typedef {object} ToolCallRecord
 * @property {number} index
 * @property {string} toolName
 * @property {object} args
 * @property {string} argsHash
 * @property {string} callHash
 * @property {number|null} step
 * @property {string|null} spanId
 * @property {string|null} status
 * @property {string|null} error
 * @property {string} source
 */

/**
 * @param {string} toolName
 * @param {object} args
 */
export function hashToolCall(toolName, args) {
  const payload = `${toolName}|${stableStringify(args)}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function pickToolName(value) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (value && typeof value === 'object') {
    for (const key of TOOL_NAME_KEYS) {
      if (key in value && typeof value[key] === 'string' && value[key].trim()) {
        return value[key].trim();
      }
    }
    if ('function' in value && value.function && typeof value.function === 'object') {
      const fn = value.function;
      if (typeof fn.name === 'string' && fn.name.trim()) {
        return fn.name.trim();
      }
    }
  }
  return 'unknown_tool';
}

/**
 * @param {Record<string, unknown>} obj
 */
function pickArgs(obj) {
  for (const key of ARGS_KEYS) {
    if (key in obj) {
      return normalizeToolArgs(obj[key]);
    }
  }
  if (obj.function && typeof obj.function === 'object' && 'arguments' in obj.function) {
    return normalizeToolArgs(obj.function.arguments);
  }
  return {};
}

/**
 * @param {string} toolName
 * @param {object} args
 * @param {object} meta
 * @returns {ToolCallRecord}
 */
function makeRecord(toolName, args, meta) {
  const normalizedArgs = normalizeToolArgs(args);
  const argsHash = hashToolCall(toolName, normalizedArgs);
  const callHash = hashToolCall(toolName, normalizedArgs);
  return {
    index: meta.index,
    toolName,
    args: normalizedArgs,
    argsHash,
    callHash,
    step: meta.step ?? null,
    spanId: meta.spanId ?? null,
    status: meta.status ?? null,
    error: meta.error ?? null,
    source: meta.source ?? 'unknown',
  };
}

/**
 * @param {Array<ToolCallRecord>} records
 * @param {string} toolName
 * @param {object} args
 * @param {object} meta
 */
function pushRecord(records, toolName, args, meta) {
  records.push(
    makeRecord(toolName, args, {
      index: records.length,
      ...meta,
    }),
  );
}

/**
 * @param {unknown} payload
 * @param {Array<ToolCallRecord>} records
 * @param {string} source
 */
function extractFromObject(payload, records, source) {
  if (!payload || typeof payload !== 'object') {
    return;
  }

  const obj = /** @type {Record<string, unknown>} */ (payload);

  if (Array.isArray(obj.tool_calls)) {
    for (const call of obj.tool_calls) {
      if (!call || typeof call !== 'object') {
        continue;
      }
      const c = /** @type {Record<string, unknown>} */ (call);
      const toolName = pickToolName(c);
      pushRecord(records, toolName, pickArgs(c), { source, step: records.length });
    }
  }

  const eventType = obj.type ?? obj.event ?? obj.kind;
  if (
    eventType === 'tool_call' ||
    eventType === 'tool' ||
    eventType === 'execute_tool' ||
    eventType === 'tool_use'
  ) {
    const toolName = pickToolName(obj);
    pushRecord(records, toolName, pickArgs(obj), {
      source,
      step: typeof obj.step === 'number' ? obj.step : records.length,
      spanId: typeof obj.span_id === 'string' ? obj.span_id : typeof obj.spanId === 'string' ? obj.spanId : null,
      status: typeof obj.status === 'string' ? obj.status : null,
      error: typeof obj.error === 'string' ? obj.error : null,
    });
  }

  if (obj.name && (obj.attributes || obj.input || obj.arguments)) {
    const spanName = String(obj.name);
    if (/tool|execute|function/i.test(spanName) || 'input' in obj || 'arguments' in obj) {
      const toolName =
        typeof obj.tool_name === 'string'
          ? obj.tool_name
          : spanName.includes('.')
            ? spanName.split('.').pop() ?? spanName
            : spanName;
      pushRecord(records, toolName, pickArgs(obj), {
        source,
        spanId: typeof obj.span_id === 'string' ? obj.span_id : typeof obj.id === 'string' ? obj.id : null,
      });
    }
  }

  if (Array.isArray(obj.messages)) {
    for (const message of obj.messages) {
      extractFromObject(message, records, `${source}:messages`);
    }
  }

  if (Array.isArray(obj.runs)) {
    for (const run of obj.runs) {
      extractFromObject(run, records, `${source}:runs`);
    }
  }

  if (Array.isArray(obj.child_runs)) {
    for (const run of obj.child_runs) {
      extractFromObject(run, records, `${source}:child_runs`);
    }
  }

  if (Array.isArray(obj.spans)) {
    for (const span of obj.spans) {
      extractFromObject(span, records, `${source}:spans`);
    }
  }

  if (Array.isArray(obj.events)) {
    for (const event of obj.events) {
      extractFromObject(event, records, `${source}:events`);
    }
  }

  if (Array.isArray(obj.steps)) {
    for (const step of obj.steps) {
      extractFromObject(step, records, `${source}:steps`);
    }
  }
}

/**
 * @param {string} content
 */
export function parseTraceContent(content) {
  const records = [];
  const warnings = [];
  const trimmed = content.trim();

  if (!trimmed) {
    return { toolCalls: records, format: 'empty', warnings: ['Trace file is empty.'] };
  }

  /** @type {string[]} */
  const formats = [];

  const tryJson = (text, label) => {
    try {
      const parsed = JSON.parse(text);
      extractFromObject(parsed, records, label);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          extractFromObject(item, records, `${label}:array`);
        }
      }
      formats.push(label);
      return true;
    } catch {
      return false;
    }
  };

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    tryJson(trimmed, 'json');
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length > 1 || (lines.length === 1 && !formats.includes('json'))) {
    let jsonlCount = 0;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        extractFromObject(parsed, records, 'jsonl');
        jsonlCount += 1;
      } catch {
        warnings.push(`Skipped non-JSON line: ${line.slice(0, 80)}...`);
      }
    }
    if (jsonlCount > 0) {
      formats.push('jsonl');
    }
  }

  const uniqueFormat =
    formats.length === 0 ? 'unknown' : formats.length === 1 ? formats[0] : formats.join('+');

  if (records.length === 0) {
    warnings.push(
      'No tool calls found. See references/trace-formats.md — export must include tool name + arguments per step.',
    );
  }

  // Re-index after all extractions
  records.forEach((record, index) => {
    record.index = index;
  });

  return { toolCalls: records, format: uniqueFormat, warnings };
}

/**
 * @param {Array<ToolCallRecord>} toolCalls
 */
export function summarizeTrace(toolCalls) {
  const byTool = new Map();
  for (const call of toolCalls) {
    byTool.set(call.toolName, (byTool.get(call.toolName) ?? 0) + 1);
  }

  return {
    totalToolCalls: toolCalls.length,
    uniqueTools: byTool.size,
    toolFrequency: Object.fromEntries(
      [...byTool.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
    ),
    steps: toolCalls.map((call) => ({
      index: call.index,
      tool: call.toolName,
      argsHash: call.argsHash,
      status: call.status,
      error: call.error,
    })),
  };
}
