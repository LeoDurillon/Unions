// The side runs that need no repository, each in a throwaway container: reading the account's connectors, the lesson writer and the prompt writer.
import { LessonWriterRunner, type LessonWriterDeps } from './lesson-writer-run';
import { ConnectorChecker } from './mcp-check';
import { PromptWriterRunner } from './prompt-writer-run';

export class ThrowawayRuns {
  private readonly connectors: ConnectorChecker;
  private readonly lessonWriter: LessonWriterRunner;
  private readonly promptWriter: PromptWriterRunner;

  constructor(deps: LessonWriterDeps) {
    this.connectors = new ConnectorChecker(deps);
    this.lessonWriter = new LessonWriterRunner(deps);
    this.promptWriter = new PromptWriterRunner(deps);
  }

  recover(): void {
    this.connectors.recover();
    this.lessonWriter.recover();
    this.promptWriter.recover();
  }

  tick(): void {
    this.connectors.tick();
    this.lessonWriter.tick();
    this.promptWriter.tick();
  }

  stop(): void {
    this.lessonWriter.stop();
    this.promptWriter.stop();
  }

  async idle(): Promise<void> {
    await Promise.all([this.connectors.idle(), this.lessonWriter.idle(), this.promptWriter.idle()]);
  }
}
