#!/usr/bin/env node
/**
 * Full triage report: parse + loop detection + classification + markdown summary.
 * Usage:
 *   node triage.mjs <trace-file> [--out report.md]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseTraceContent, summarizeTrace } from './lib/parse-trace-core.mjs';
import { classifyFailure, detectLoops } from './lib/detect-loops-core.mjs';

const BUCKET_GUIDE = {
  tool_selection: 'references/failure-taxonomy.md#1-tool-selection',
  tool_arguments: 'references/failure-taxonomy.md#2-tool-arguments',
  tool_execution: 'references/failure-taxonomy.md#3-tool-execution',
  state_orchestration: 'references/failure-taxonomy.md#4-state--orchestration',
  recovery_policy: 'references/failure-taxonomy.md#5-recovery-policy',
  unknown: 'references/trace-formats.md',
};

function printHelp() {
  console.log(`Usage: node triage.mjs <trace-file> [--out report.md] [--json]

Writes a markdown triage report for the user / Claude to act on.
`);
}

/**
 * @param {object} report
 */
function renderMarkdown(report) {
  const lines = [
    '# Agent Trace Triage Report',
    '',
    `**File:** \`${report.file}\``,
    `**Detected format:** ${report.format}`,
    `**Tool calls:** ${report.summary.totalToolCalls}`,
    `**Loop detected:** ${report.hasLoop ? 'Yes' : 'No'}`,
    '',
    '## Classification',
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| Bucket | \`${report.classification.bucket}\` |`,
    `| Confidence | ${report.classification.confidence} |`,
    '',
    report.classification.summary,
    '',
  ];

  if (report.loops.length) {
    lines.push('## Loop findings', '');
    for (const loop of report.loops) {
      lines.push(
        `### ${loop.type} (${loop.severity}) — steps ${loop.startIndex}–${loop.endIndex}`,
        '',
        loop.message,
        '',
        `- Tools: ${loop.involvedTools.join(', ')}`,
        `- Hashes: \`${loop.involvedHashes.join('`, `')}\``,
        '',
      );
    }
  }

  lines.push('## Recommendations', '');
  for (const rec of report.classification.recommendations ?? []) {
    lines.push(`- ${rec}`);
  }

  lines.push('', '## Tool frequency', '');
  for (const [tool, count] of Object.entries(report.summary.toolFrequency)) {
    lines.push(`- \`${tool}\`: ${count}`);
  }

  lines.push('', '## Next steps for Claude', '');
  lines.push(
    '1. Open the agent source where the **first bad step** is implemented (router, tool registry, retry policy).',
    '2. Apply fixes for bucket `' + report.classification.bucket + '` using `' + (BUCKET_GUIDE[report.classification.bucket] ?? 'references/failure-taxonomy.md') + '`.',
    '3. Add a regression test from `templates/regression-test.py.template`.',
    '4. Re-run the agent and pass the new trace to `/agent-trace-triage` to confirm `hasLoop: false`.',
    '',
  );

  if (report.warnings.length) {
    lines.push('## Warnings', '');
    for (const w of report.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const filePath = args.find((arg) => !arg.startsWith('--'));
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const asJson = args.includes('--json');

  if (!filePath) {
    console.error('Error: provide a trace file path.');
    process.exit(2);
  }

  const content = readFileSync(filePath, 'utf8');
  const parsed = parseTraceContent(content);
  const summary = summarizeTrace(parsed.toolCalls);
  const loopResult = detectLoops(parsed.toolCalls);
  const classification = classifyFailure(parsed.toolCalls, loopResult.findings);

  const report = {
    file: filePath,
    format: parsed.format,
    summary,
    hasLoop: loopResult.hasLoop,
    loops: loopResult.findings,
    classification,
    warnings: parsed.warnings,
    toolCalls: parsed.toolCalls,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(parsed.toolCalls.length === 0 ? 2 : loopResult.hasLoop ? 1 : 0);
  }

  const md = renderMarkdown(report);
  if (outPath) {
    writeFileSync(outPath, md, 'utf8');
    console.log(`Wrote ${outPath}`);
  } else {
    console.log(md);
  }

  process.exit(parsed.toolCalls.length === 0 ? 2 : loopResult.hasLoop ? 1 : 0);
}

main();
