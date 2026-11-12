// The image runtime on the `docker` command line: the projects' own agent images, built, pulled, inspected and removed.
import { run, stream } from './docker-cli';
import type { ExecResult, ImageInfo, ImageRuntime } from './runtime';

export class DockerImages implements ImageRuntime {
  async inspect(ref: string): Promise<ImageInfo | null> {
    const inspected = await run(['image', 'inspect', '--format', '{{.Id}} {{.Size}}', ref]);
    if (inspected.code !== 0) {
      return null;
    }
    const [id = '', size = '0'] = inspected.stdout.trim().split(' ');
    return { id, sizeBytes: Number(size) };
  }

  build(spec: {
    tag: string;
    dockerfile: string;
    signal: AbortSignal;
  }): AsyncGenerator<string, ExecResult> {
    // `-` as the context: the Dockerfile comes on stdin and no file goes with it.
    const command = ['build', '--progress=plain', '--tag', spec.tag, '-'];
    return stream(command, spec.dockerfile, spec.signal, true);
  }

  pull(ref: string, signal: AbortSignal): AsyncGenerator<string, ExecResult> {
    return stream(['pull', ref], undefined, signal, true);
  }

  async tags(repository: string): Promise<string[]> {
    const listed = await run(['image', 'ls', repository, '--format', '{{.Repository}}:{{.Tag}}']);
    if (listed.code !== 0) {
      return [];
    }
    return listed.stdout
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.endsWith(':<none>'));
  }

  async remove(ref: string): Promise<void> {
    // Without `--force`: an image a container still uses stays, and that is fine.
    await run(['image', 'rm', ref]);
  }
}
