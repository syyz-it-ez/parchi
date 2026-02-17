export type QaToolEventStatus = 'running' | 'success' | 'error';

export type QaToolEvent = {
  id: string;
  runId: string;
  tool: string;
  args: Record<string, unknown>;
  status: QaToolEventStatus;
  startedAt: number;
  endedAt?: number;
  resultSummary?: string;
};

export type QaSpecStep = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  note?: string;
};

export type QaSpec = {
  schemaVersion: 1;
  name: string;
  createdAt: number;
  source: {
    sessionId?: string;
    runId?: string;
    exportedAt: string;
    toolEvents: number;
    steps: number;
    skipped: number;
  };
  steps: QaSpecStep[];
};

export type BuildQaSpecOptions = {
  name?: string;
  sessionId?: string;
  runId?: string | null;
  includeFailed?: boolean;
};

export const NON_REPLAYABLE_TOOLS = new Set([
  'set_plan',
  'update_plan',
  'spawn_subagent',
  'subagent_complete',
]);

export const pickLatestRunId = (events: QaToolEvent[]): string | null => {
  if (!events.length) return null;
  let latestRunId: string | null = null;
  let latestTimestamp = -1;
  events.forEach((event) => {
    const timestamp = event.endedAt || event.startedAt || 0;
    if (timestamp >= latestTimestamp) {
      latestTimestamp = timestamp;
      latestRunId = event.runId || latestRunId;
    }
  });
  return latestRunId;
};

export const buildQaSpec = (events: QaToolEvent[], options: BuildQaSpecOptions = {}): QaSpec => {
  const safeEvents = Array.isArray(events) ? events.slice() : [];
  const runId = options.runId ?? pickLatestRunId(safeEvents);
  const ordered = safeEvents
    .filter((event) => (runId ? event.runId === runId : true))
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));

  const includeFailed = options.includeFailed === true;
  let skipped = 0;

  const steps: QaSpecStep[] = ordered
    .filter((event) => {
      if (!event || !event.tool) return false;
      if (NON_REPLAYABLE_TOOLS.has(event.tool)) {
        skipped += 1;
        return false;
      }
      if (!includeFailed && event.status === 'error') {
        skipped += 1;
        return false;
      }
      return true;
    })
    .map((event, index) => ({
      id: `step-${index + 1}`,
      tool: event.tool,
      args: event.args || {},
      note: event.resultSummary,
    }));

  const now = Date.now();
  const name = options.name?.trim() || 'QA Spec';

  return {
    schemaVersion: 1,
    name,
    createdAt: now,
    source: {
      sessionId: options.sessionId,
      runId: runId || undefined,
      exportedAt: new Date(now).toISOString(),
      toolEvents: ordered.length,
      steps: steps.length,
      skipped,
    },
    steps,
  };
};
