#!/usr/bin/env node
/**
 * Parse agent trace files into normalized tool calls.
 * Usage:
 *   node parse-trace.mjs <trace-file> [--summary] [--json]
 */
import { readFileSync } from 'node:fs';
import { parseTraceContent, summarizeTrace } from './lib/parse-trace-core.mjs';

function printHelp() {
  console.log(`Usage: node parse-trace.mjs <trace-file> [--summary] [--json]

Options:
  --summary   Print human-readable summary (default when no --json)
  --json      Print full JSON (toolCalls + meta)
  --help      Show this help
`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const filePath = args.find((arg) => !arg.startsWith('--'));
  if (!filePath) {
    console.error('Error: provide a trace file path.');
    printHelp();
    process.exit(1);
  }

  const asJson = args.includes('--json');
  const asSummary = args.includes('--summary') || !asJson;

  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Error: cannot read "${filePath}": ${error.message}`);
    process.exit(1);
  }

  const parsed = parseTraceContent(content);
  const summary = summarizeTrace(parsed.toolCalls);

  const output = {
    file: filePath,
    format: parsed.format,
    warnings: parsed.warnings,
    summary,
    toolCalls: parsed.toolCalls,
  };

  if (asJson) {
    console.log(JSON.stringify(output, null, 2));
    process.exit(parsed.toolCalls.length === 0 ? 2 : 0);
  }

  if (asSummary) {
    console.log('Agent Trace Parse Report');
    console.log('========================');
    console.log(`File:   ${filePath}`);
    console.log(`Format: ${parsed.format}`);
    console.log(`Calls:  ${summary.totalToolCalls}`);
    console.log(`Tools:  ${summary.uniqueTools}`);
    if (parsed.warnings.length) {
      console.log('\nWarnings:');
      for (const warning of parsed.warnings) {
        console.log(`  - ${warning}`);
      }
    }
    console.log('\nTool frequency:');
    for (const [tool, count] of Object.entries(summary.toolFrequency)) {
      console.log(`  ${tool}: ${count}`);
    }
    console.log('\nSteps (index | tool | argsHash):');
    for (const step of summary.steps) {
      const err = step.error ? ` ERROR: ${step.error}` : '';
      console.log(`  ${step.index} | ${step.tool} | ${step.argsHash}${err}`);
    }
  }

  process.exit(parsed.toolCalls.length === 0 ? 2 : 0);
}

main();
