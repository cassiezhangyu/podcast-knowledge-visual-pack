export type LogEvent = { timestamp: string; event: string; [key: string]: unknown };

export class JsonLogger {
  readonly events: LogEvent[] = [];
  info(event: string, details: Record<string, unknown> = {}) {
    const entry = { timestamp: new Date().toISOString(), event, ...details };
    this.events.push(entry);
    process.stderr.write(`${JSON.stringify(entry)}\n`);
  }
}
