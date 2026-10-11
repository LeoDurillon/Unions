import { spawn } from 'node:child_process';

import type { ContainerRuntime, ExecOptions, ExecResult, TicketContainerSpec } from './runtime';

const AGENT_HOME = '/home/node';
const WORKSPACE = '/workspace';

type Captured = { code: number; stdout: string; stderr: string };

function run(args: string[], stdin?: string): Promise<Captured> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.end(stdin ?? '');
  });
}

async function ok(args: string[], stdin?: string): Promise<string> {
  const r = await run(args, stdin);
  if (r.code !== 0) {
    throw new Error(`docker ${args.slice(0, 2).join(' ')} failed: ${r.stderr.trim()}`);
  }
  return r.stdout;
}

export class DockerCli implements ContainerRuntime {
  async create(spec: TicketContainerSpec): Promise<void> {
    const existing = await run(['container', 'inspect', spec.name]);
    if (existing.code === 0) {
      return;
    }
    await ok(['volume', 'create', spec.homeVolume]);
    await ok(['volume', 'create', spec.workspaceVolume]);
    const env = Object.entries(spec.env ?? {}).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
    await ok([
      'create',
      '--init',
      '--name',
      spec.name,
      '-v',
      `${spec.homeVolume}:${AGENT_HOME}`,
      '-v',
      `${spec.workspaceVolume}:${WORKSPACE}`,
      '-w',
      WORKSPACE,
      ...env,
      spec.image,
      'sleep',
      'infinity',
    ]);
  }

  async start(name: string): Promise<void> {
    await ok(['start', name]);
  }

  async stop(name: string): Promise<void> {
    await ok(['stop', '-t', '5', name]);
  }

  async remove(name: string, volumes?: { home: string; workspace: string }): Promise<void> {
    await run(['rm', '-f', name]);
    if (volumes) {
      await run(['volume', 'rm', '-f', volumes.home, volumes.workspace]);
    }
  }

  async isRunning(name: string): Promise<boolean> {
    const r = await run(['container', 'inspect', '-f', '{{.State.Running}}', name]);
    return r.code === 0 && r.stdout.trim() === 'true';
  }

  async *exec(
    name: string,
    command: string[],
    options: ExecOptions = {},
  ): AsyncGenerator<string, ExecResult> {
    const env = Object.entries(options.env ?? {}).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
    const args = [
      'exec',
      '-i',
      ...(options.cwd ? ['-w', options.cwd] : []),
      ...env,
      name,
      ...command,
    ];
    const child = spawn('docker', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: options.signal,
    });
    child.stdin.end(options.stdin ?? '');

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    const exited = new Promise<number>((resolve) => {
      child.on('error', () => {
        resolve(1);
      });
      child.on('close', (code) => {
        resolve(code ?? 1);
      });
    });

    let pending = '';
    const stdout: AsyncIterable<Buffer | string> = child.stdout;
    for await (const chunk of stdout) {
      pending += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        yield line;
      }
    }
    if (pending) {
      yield pending;
    }
    return { exitCode: await exited, stderr };
  }

  async copyIn(name: string, hostDir: string, containerDir: string): Promise<void> {
    await ok(['exec', '-u', 'root', name, 'mkdir', '-p', containerDir]);
    await ok(['cp', `${hostDir}/.`, `${name}:${containerDir}`]);
    await ok(['exec', '-u', 'root', name, 'chown', '-R', 'node:node', containerDir]);
  }

  async copyOut(name: string, containerPath: string, hostPath: string): Promise<void> {
    await ok(['cp', `${name}:${containerPath}`, hostPath]);
  }

  async writeFile(
    name: string,
    containerPath: string,
    content: string,
    mode = '600',
  ): Promise<void> {
    // stdin through `sh -c` avoids temp files and `docker cp` ownership issues.
    await ok(
      [
        'exec',
        '-i',
        name,
        'sh',
        '-c',
        `mkdir -p "$(dirname '${containerPath}')" && cat > '${containerPath}' && chmod ${mode} '${containerPath}'`,
      ],
      content,
    );
  }
}
