#!/usr/bin/env node
const fs = require('fs');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  let payload = {};
  try {
    payload = input.trim() ? JSON.parse(input) : {};
  } catch (error) {
    payload = { parse_error: String(error), raw: input };
  }

  const event = {
    source: 'claude-stop-hook',
    dmuxPaneId: process.env.DMUX_PANE_ID || '',
    tmuxPaneId: process.env.DMUX_TMUX_PANE_ID || '',
    expectedDmuxPaneId: 'dmux-1782484548803',
    expectedTmuxPaneId: '%6',
    hookEventName: payload.hook_event_name || payload.hookEventName || '',
    stopHookActive: payload.stop_hook_active === true || payload.stopHookActive === true,
    turnId: payload.session_id || payload.turn_id || payload.turnId || '',
    lastAssistantMessage: payload.last_assistant_message || null,
    transcriptPath: payload.transcript_path || null,
    cwd: payload.cwd || process.cwd(),
    timestamp: Date.now()
  };

  if (event.hookEventName && event.hookEventName !== 'Stop') {
    process.exit(0);
  }

  if (event.dmuxPaneId !== event.expectedDmuxPaneId) {
    process.exit(0);
  }

  try {
    fs.writeFileSync('/Users/hyodo/discord/jujo_discord_app/.dmux/worktrees/dmux-2026-06-26-233547/.claude/dmux/dmux-1782484548803.json', JSON.stringify(event, null, 2));
  } catch (error) {
    process.exit(0);
  }

  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
});
