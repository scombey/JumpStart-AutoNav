#!/usr/bin/env node
/**
 * Hook #16 — SessionStart: Timeline warmup
 *
 * Confirms the timeline file exists and injects a compact summary of the most
 * recent recorded session/activity.
 */

const path = require('path');
const {
  runCli,
  readJsonSafe,
  loadHookState,
  saveHookState,
  ensureSessionRecord,
  extractSessionId,
} = require('./lib/common');

function summarizeTimeline(root) {
  const timelinePath = path.join(root, '.jumpstart', 'state', 'timeline.json');
  const timeline = readJsonSafe(timelinePath, null);
  if (!timeline || !Array.isArray(timeline.events)) {
    return {
      exists: false,
      path: '.jumpstart/state/timeline.json',
      events: 0,
      summary: 'Timeline file is missing or empty.',
    };
  }

  const lastEvent = timeline.events[timeline.events.length - 1] || null;
  const lastSessionId = lastEvent ? lastEvent.session_id : timeline.session_id || null;
  return {
    exists: true,
    path: '.jumpstart/state/timeline.json',
    events: timeline.events.length,
    last_session_id: lastSessionId,
    last_event_type: lastEvent ? lastEvent.event_type : null,
    last_event_action: lastEvent ? lastEvent.action : null,
    last_event_at: lastEvent ? lastEvent.timestamp : null,
    summary: lastEvent
      ? `Timeline ready with ${timeline.events.length} event(s); last event was ${lastEvent.event_type} at ${lastEvent.timestamp}.`
      : 'Timeline file exists but has no events.',
  };
}

function handle(input, ctx) {
  const sid = extractSessionId(input) || 'default';
  const summary = summarizeTimeline(ctx.root);
  const hookState = loadHookState(ctx.root);
  const session = ensureSessionRecord(hookState, sid, ctx.now);
  session.startup_context.push({
    type: 'timeline-warmup',
    at: ctx.now.toISOString(),
    value: summary,
  });
  saveHookState(ctx.root, hookState);

  const additionalContext = [
    '[AutoNav Timeline Warmup]',
    `Timeline path: ${summary.path}`,
    summary.summary,
    summary.last_session_id ? `Last session: ${summary.last_session_id}` : null,
    summary.last_event_action ? `Last action: ${summary.last_event_action}` : null,
  ].filter(Boolean).join('\n');

  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext,
      },
      additionalContext,
    }) + '\n',
  };
}

module.exports = {
  handle,
  summarizeTimeline,
};

if (require.main === module) {
  runCli(handle);
}
