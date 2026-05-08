#!/usr/bin/env node

/**
 * Auto-Tracker-Save Hook for Gemini CLI & Claude Code
 * 
 * Event: AfterTool (Gemini CLI) / SubagentStop (Claude Code)
 * 
 * This hook parses the output of an agent run and automatically
 * queues a save_run call to the UluOps Tracker.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch (err) {
    process.stderr.write('Failed to parse hook input: ' + err.message + '\n');
    process.exit(1);
  }

  const { tool_name, tool_response, metadata, cwd } = input;

  // Handle both Gemini CLI's invoke_agent and Claude Code's agent execution
  // (In Claude Code, tool_name might be the specific agent tool if it's rendered as one)
  const isAgentTool = tool_name === 'invoke_agent' || tool_name.startsWith('uluops-');
  
  if (!isAgentTool) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const content = tool_response?.llmContent || tool_response?.content || '';
  if (!content) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  // --- Parsing Logic ---
  
  // 1. Extract Agent Name
  let agentName = input.tool_input?.agent_name || tool_name.replace(/^uluops-/, '');
  if (agentName === 'invoke_agent') agentName = 'unknown-agent';

  // 2. Extract Verdict and Score
  // Broaden pattern to catch various agent output styles
  const decisionMatch = content.match(/\*\*Verdict:\s*([A-Z_]+)/i) || 
                        content.match(/\*\*Decision:\s*([A-Z_]+)/i) ||
                        content.match(/Verdict:\s*([A-Z_]+)/i) ||
                        content.match(/Decision:\s*([A-Z_]+)/i);
  
  const scoreMatch = content.match(/\(Score:\s*(\d+)\/100\)/i) ||
                     content.match(/Score:\s*(\d+)/i);
  
  const decision = decisionMatch ? decisionMatch[1].toUpperCase() : 'PASS';
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 100;

  // 3. Extract Summary
  const summaryMatch = content.match(/### Executive Summary\n\n(.*?)(?:\n\n|###|$)/s) ||
                       content.match(/Summary\n\n(.*?)(?:\n\n|###|$)/s) ||
                       content.match(/## .*?\n\n(.*?)(?:\n\n|###|$)/s);
  const summary = summaryMatch ? summaryMatch[1].trim().substring(0, 500) : `Auto-saved run for ${agentName}`;

  // 4. Extract Recommendations & Failure Codes
  const recommendations = [];
  // Resilient pattern for list items containing a failure code
  const lines = content.split('\n');
  for (const line of lines) {
    const codeMatch = line.match(/`([A-Z]{3}-[A-Z]{3}\/[CHMLI])`/);
    if (codeMatch) {
      const code = codeMatch[1];
      // Try to extract title: everything before the first '(' or '`' or '-'
      let title = line.replace(/^\s*[\*\-]\s*/, '') // remove bullet
                      .split(/[`\(\-]/)[0] // take everything before first separator
                      .trim();
      
      if (!title) title = `Issue ${code}`;

      // Try to extract priority
      const priorityMatch = line.match(/\((Priority: )?(critical|high|suggested|backlog)\)/i);
      const priority = priorityMatch ? priorityMatch[2].toLowerCase() : 'suggested';

      recommendations.push({
        agent: agentName,
        title: title.substring(0, 100),
        priority,
        failure_code: code,
        description: 'Extracted via auto-save hook'
      });
    }
  }

  // 5. Project Name Detection
  let project = 'default-project';
  if (cwd) {
    const parts = cwd.split('/');
    // If we're in a sub-repo (like uluops packages), use the last two parts
    if (parts.length > 2 && (parts[parts.length-2].startsWith('-') || parts[parts.length-2] === 'packages')) {
      project = parts[parts.length-1];
    } else {
      project = parts.pop();
    }
  }

  // --- Build Tail Call ---

  const saveRunArgs = {
    project,
    workflow_type: 'auto-save',
    agents: [{
      name: agentName,
      model: metadata?.model || 'gemini-1.5-pro',
      decision,
      score: score,
      summary,
      tokens: {
        input_tokens: metadata?.input_tokens || 0,
        output_tokens: metadata?.output_tokens || 0,
        cache_creation_tokens: metadata?.cache_creation_tokens || 0,
        cache_read_tokens: metadata?.cache_read_tokens || 0
      }
    }],
    recommendations
  };

  const output = {
    decision: 'allow',
    systemMessage: `[hook] Auto-saving ${agentName} results to tracker (Project: ${project})...`,
    hookSpecificOutput: {
      tailToolCallRequest: {
        name: 'mcp_uluops-tracker_save_run',
        args: saveRunArgs
      }
    }
  };

  process.stdout.write(JSON.stringify(output));
}

main();
