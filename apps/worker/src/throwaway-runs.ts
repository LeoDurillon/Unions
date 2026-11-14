// The side runs in throwaway containers: connectors, the lesson and prompt writers, setup checks.
// Only the checks of setup proposals work on a clone of the repository.
import { LessonWriterRunner, type LessonWriterDeps } from './lesson-writer-run';
import { ConnectorChecker } from './mcp-check';
import { PromptWriterRunner } from './prompt-writer-run';
import { SetupChecker } from './setup/setup-checker';

export class ThrowawayRuns {
  private readonly connectors: ConnectorChecker;
  private readonly lessonWriter: LessonWriterRunner;
  private readonly promptWriter: PromptWriterRunner;
  private readonly setupChecks: SetupChecker;

  constructor(deps: LessonWriterDeps) {
    this.connectors = new ConnectorChecker(deps);
    this.lessonWriter = new LessonWriterRunner(deps);
    this.promptWriter = new PromptWriterRunner(deps);
    this.setupChecks = new SetupChecker(deps);
  }

  async recover(): Promise<void> {
    this.connectors.recover();
    this.lessonWriter.recover();
    this.promptWriter.recover();
    await this.setupChecks.recover();
  }

  tick(): void {
    this.connectors.tick();
    this.lessonWriter.tick();
    this.promptWriter.tick();
    this.setupChecks.tick();
  }

  stop(): void {
    this.lessonWriter.stop();
    this.promptWriter.stop();
    this.setupChecks.stop();
  }

  async idle(): Promise<void> {
    await Promise.all([
      this.connectors.idle(),
      this.lessonWriter.idle(),
      this.promptWriter.idle(),
      this.setupChecks.idle(),
    ]);
  }
}
