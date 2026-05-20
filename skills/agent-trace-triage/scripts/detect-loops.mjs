#!/usr/bin/env node
/**
 * Detect agent tool-call loops in trace files.
 * Usage:
 *   node detect-loops.mjs <trace-file> [--json] [--threshold N]
 */
import { readFileSync } from 'node:fs';
import { parseTraceContent } from './lib/parse-trace-core.mjs';
import { classifyFailure, detectLoops } from './lib/detect-loops-core.mjs';

function printHelp() {
  console.log(`Usage: node detect-loops.mjs <trace-file> [--json] [--threshold N]

Options:
  --json          Machine-readable report (recommended for Claude)
  --threshold N   Identical repeat threshold (default: 3)
  --help          Show this help

Exit codes:
  0 = no loop detected
  1 = loop detected
  2 = parse error / no tool calls
`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const filePath = args.find((arg) => !arg.startsWith('--'));
  const asJson = args.includes('--json');
  const thresholdIdx = args.indexOf('--threshold');
  const directRepeatThreshold =
    thresholdIdx >= 0 && args[thresholdIdx + 1] ? Number(args[thresholdIdx + 1]) : 3;

  if (!filePath) {
    console.error('Error: provide a trace file path.');
    printHelp();
    process.exit(2);
  }

  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Error: cannot read "${filePath}": ${error.message}`);
    process.exit(2);
  }

  const parsed = parseTraceContent(content);
  if (parsed.toolCalls.length === 0) {
    const payload = {
      file: filePath,
      ok: false,
      error: 'no_tool_calls',
      warnings: parsed.warnings,
    };
    if (asJson) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.error('No tool calls found in trace.');
      for (const warning of parsed.warnings) {
        console.error(`  - ${warning}`);
      }
    }
    process.exit(2);
  }

  const loopResult = detectLoops(parsed.toolCalls, { directRepeatThreshold });
  const classification = classifyFailure(parsed.toolCalls, loopResult.findings);

  const report = {
    file: filePath,
    format: parsed.format,
    totalToolCalls: parsed.toolCalls.length,
    hasLoop: loopResult.hasLoop,
    loops: loopResult.findings,
    classification,
    warnings: parsed.warnings,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(loopResult.hasLoop ? 1 : 0);
  }

  console.log('Agent Loop Detection Report');
  console.log('===========================');
  console.log(`File:  ${filePath}`);
  console.log(`Calls: ${parsed.toolCalls.length}`);
  console.log(`Loop:  ${loopResult.hasLoop ? 'YES' : 'no'}`);
  console.log(`\nClassification: ${classification.bucket} (${classification.confidence})`);
  console.log(classification.summary);

  if (loopResult.findings.length) {
    console.log('\nLoop findings:');
    for (const finding of loopResult.findings) {
      console.log(
        `  [${finding.severity}] ${finding.type} @ steps ${finding.startIndex}-${finding.endIndex}: ${finding.message}`,
      );
    }
  }

  if (classification.recommendations?.length) {
    console.log('\nRecommendations:');
    for (const rec of classification.recommendations) {
      console.log(`  - ${rec}`);
    }
  }

  process.exit(loopResult.hasLoop ? 1 : 0);
}

main();
