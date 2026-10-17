// The side runs that need no repository, each in a throwaway container: reading the account's connectors, and the lesson writer.
import { LessonWriterRunner, type LessonWriterDeps } from './lesson-writer-run';
import { ConnectorChecker } from './mcp-check';

export class ThrowawayRuns {
  private readonly connectors: ConnectorChecker;
  private readonly lessonWriter: LessonWriterRunner;

  constructor(deps: LessonWriterDeps) {
    this.connectors = new ConnectorChecker(deps);
    this.lessonWriter = new LessonWriterRunner(deps);
  }

  recover(): void {
    this.connectors.recover();
    this.lessonWriter.recover();
  }

  tick(): void {
    this.connectors.tick();
    this.lessonWriter.tick();
  }

  stop(): void {
    this.lessonWriter.stop();
  }

  async idle(): Promise<void> {
    await Promise.all([this.connectors.idle(), this.lessonWriter.idle()]);
  }
}
