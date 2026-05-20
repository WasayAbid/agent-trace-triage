import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { parseTraceContent } from '../skills/agent-trace-triage/scripts/lib/parse-trace-core.mjs';
import { detectLoops, classifyFailure } from '../skills/agent-trace-triage/scripts/lib/detect-loops-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, 'fixtures');
const scriptsDir = join(__dirname, '..', 'skills', 'agent-trace-triage', 'scripts');

function fixture(name) {
  return readFileSync(join(fixtures, name), 'utf8');
}

function runNode(script, args) {
  return spawnSync(process.execPath, [join(scriptsDir, script), ...args], {
    encoding: 'utf8',
  });
}

test('parse simple JSONL tool calls', () => {
  const parsed = parseTraceContent(fixture('healthy-run.jsonl'));
  assert.equal(parsed.toolCalls.length, 3);
  assert.equal(parsed.toolCalls[0].toolName, 'list_files');
});

test('detect direct repeat loop', () => {
  const parsed = parseTraceContent(fixture('direct-loop.jsonl'));
  const { findings, hasLoop } = detectLoops(parsed.toolCalls);
  assert.equal(hasLoop, true);
  assert.ok(findings.some((f) => f.type === 'direct_repeat'));
  const classification = classifyFailure(parsed.toolCalls, findings);
  assert.equal(classification.bucket, 'recovery_policy');
});

test('detect ping-pong loop', () => {
  const parsed = parseTraceContent(fixture('ping-pong.jsonl'));
  const { findings, hasLoop } = detectLoops(parsed.toolCalls);
  assert.equal(hasLoop, true);
  assert.ok(findings.some((f) => f.type === 'ping_pong'));
});

test('classify tool execution errors', () => {
  const parsed = parseTraceContent(fixture('tool-execution-error.jsonl'));
  const { findings, hasLoop } = detectLoops(parsed.toolCalls);
  assert.equal(hasLoop, false);
  const classification = classifyFailure(parsed.toolCalls, findings);
  assert.equal(classification.bucket, 'tool_execution');
});

test('healthy run has no loop', () => {
  const parsed = parseTraceContent(fixture('healthy-run.jsonl'));
  const { hasLoop } = detectLoops(parsed.toolCalls);
  assert.equal(hasLoop, false);
});

test('parse OpenAI messages export', () => {
  const parsed = parseTraceContent(fixture('openai-messages.json'));
  assert.equal(parsed.toolCalls.length, 3);
  assert.equal(parsed.toolCalls[0].toolName, 'search_kb');
});

test('CLI detect-loops exits 1 on loop fixture', () => {
  const result = runNode('detect-loops.mjs', [
    join(fixtures, 'direct-loop.jsonl'),
    '--json',
  ]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.hasLoop, true);
});

test('CLI detect-loops exits 0 on healthy fixture', () => {
  const result = runNode('detect-loops.mjs', [
    join(fixtures, 'healthy-run.jsonl'),
    '--json',
  ]);
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.hasLoop, false);
});

test('CLI triage writes markdown', () => {
  const out = join(__dirname, 'tmp-triage-report.md');
  const result = runNode('triage.mjs', [
    join(fixtures, 'direct-loop.jsonl'),
    '--out',
    out,
  ]);
  assert.equal(result.status, 1);
  const md = readFileSync(out, 'utf8');
  assert.match(md, /recovery_policy|Loop detected: Yes/);
  assert.match(md, /direct_repeat/);
});
