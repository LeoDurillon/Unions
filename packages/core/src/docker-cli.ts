// The container runtime that drives the `docker` command line to run ticket containers.
import { spawn } from 'node:child_process';

import { CONTAINER_FORMAT, parseProjectContainers } from './compose-containers';
import { checkCopiedFile } from './copied-file';
import { helperArgs, removeOnAbort } from './docker-helper';
import { mergedLines } from './merged-lines';
import type {
  ContainerRuntime,
  ExecOptions,
  ExecResult,
  HelperSpec,
  ProjectContainer,
  TicketContainerSpec,
} from './runtime';

const AGENT_HOME = '/home/node';
const WORKSPACE = '/workspace';

type Captured = { code: number; stdout: string; stderr: string };

export function run(args: string[], stdin?: string): Promise<Captured> {
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

/**
 * Runs `docker <args>`, yielding stdout line by line (with stderr's lines too when `merge`); returns
 * the exit code and stderr (empty when merged).
 */
export async function* stream(
  args: string[],
  stdin: string | undefined,
  signal?: AbortSignal,
  merge = false,
): AsyncGenerator<string, ExecResult> {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], signal });
  child.stdin.end(stdin ?? '');
  let stderr = '';
  if (!merge) {
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
  }
  const exited = new Promise<number>((resolve) => {
    child.on('error', () => {
      resolve(1);
    });
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
  const sources: AsyncIterable<Buffer | string>[] = merge
    ? [child.stdout, child.stderr]
    : [child.stdout];
  yield* mergedLines(sources);
  return { exitCode: await exited, stderr };
}

/**
 * Whether the container exists and is kept. A stopped one built from an older agent image is
 * removed so it is created again from the current one: its state is all in its volumes.
 */
async function keepExisting(spec: TicketContainerSpec): Promise<boolean> {
  const existing = await run([
    'container',
    'inspect',
    '--format',
    '{{.Image}} {{.State.Running}}',
    spec.name,
  ]);
  if (existing.code !== 0) {
    return false;
  }
  const [image, running] = existing.stdout.trim().split(' ');
  const current = await run(['image', 'inspect', '--format', '{{.Id}}', spec.image]);
  if (running === 'true' || current.code !== 0 || current.stdout.trim() === image) {
    return true;
  }
  await ok(['rm', spec.name]);
  return false;
}

export class DockerCli implements ContainerRuntime {
  async create(spec: TicketContainerSpec): Promise<void> {
    if (await keepExisting(spec)) {
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

  exec(
    name: string,
    command: string[],
    options: ExecOptions = {},
  ): AsyncGenerator<string, ExecResult> {
    const env = Object.entries(options.env ?? {}).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
    const args = [
      'exec',
      '-i',
      ...(options.cwd ? ['-w', options.cwd] : []),
      ...(options.user ? ['-u', options.user] : []),
      ...env,
      name,
      ...command,
    ];
    return stream(args, options.stdin, options.signal);
  }

  runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult> {
    if (!spec.signal) {
      return stream(helperArgs(spec, null), spec.stdin);
    }
    // Killing the CLI would leave the container running: an abort removes the container instead.
    const name = `union-helper-${crypto.randomUUID()}`;
    removeOnAbort(spec.signal, async () => {
      await run(['rm', '-f', name]);
    });
    return stream(helperArgs(spec, name), spec.stdin);
  }

  async projectNetworks(project: string): Promise<string[]> {
    const listed = await ok([
      'network',
      'ls',
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--format',
      '{{.Name}}',
    ]);
    return listed.split('\n').filter((line) => line.trim() !== '');
  }

  async projectContainers(project: string): Promise<ProjectContainer[]> {
    const listed = await ok([
      'ps',
      '-a',
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--format',
      CONTAINER_FORMAT,
    ]);
    return parseProjectContainers(listed);
  }

  async serviceContainers(network: string, service: string): Promise<string[]> {
    const listed = await ok([
      'ps',
      '--filter',
      `network=${network}`,
      '--filter',
      `label=com.docker.compose.service=${service}`,
      '--format',
      '{{.Names}}',
    ]);
    return listed.split('\n').filter((line) => line.trim() !== '');
  }

  async connectNetwork(network: string, container: string): Promise<void> {
    const joined = await run(['network', 'connect', network, container]);
    if (joined.code !== 0 && !/already exists|already attached/iu.test(joined.stderr)) {
      throw new Error(`docker network connect failed: ${joined.stderr.trim()}`);
    }
  }

  async disconnectNetwork(network: string, container: string): Promise<void> {
    const left = await run(['network', 'disconnect', network, container]);
    if (left.code !== 0 && !/is not connected|not found|No such/iu.test(left.stderr)) {
      throw new Error(`docker network disconnect failed: ${left.stderr.trim()}`);
    }
  }

  async networkExists(name: string): Promise<boolean> {
    const inspected = await run(['network', 'inspect', name]);
    return inspected.code === 0;
  }

  async copyIn(name: string, hostDir: string, containerDir: string): Promise<void> {
    await ok(['exec', '-u', 'root', name, 'mkdir', '-p', containerDir]);
    await ok(['cp', `${hostDir}/.`, `${name}:${containerDir}`]);
    await ok(['exec', '-u', 'root', name, 'chown', '-R', 'node:node', containerDir]);
  }

  async copyIntoVolume(
    volume: string,
    image: string,
    files: { hostPath: string; volumePath: string }[],
  ): Promise<void> {
    const name = `union-copy-${crypto.randomUUID()}`;
    await ok(['create', '--name', name, '-v', `${volume}:/volume`, image, 'true']);
    try {
      for (const file of files) {
        // oxlint-disable-next-line no-await-in-loop -- one docker cp at a time into the same container
        await ok(['cp', file.hostPath, `${name}:/volume/${file.volumePath}`]);
      }
    } finally {
      await run(['rm', '-f', name]);
    }
  }

  async copyOut(
    name: string,
    containerPath: string,
    hostPath: string,
    maxBytes?: number,
  ): Promise<void> {
    await ok(['cp', `${name}:${containerPath}`, hostPath]);
    await checkCopiedFile(hostPath, maxBytes);
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
