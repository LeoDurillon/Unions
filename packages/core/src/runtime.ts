/** Everything the worker needs from Docker. Swap the CLI implementation for the Engine API without touching callers. */

export type TicketContainerSpec = {
  name: string;
  image: string;
  homeVolume: string;
  workspaceVolume: string;
  env?: Record<string, string>;
};

export type ExecOptions = {
  cwd?: string;
  stdin?: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
};

export type ExecResult = { exitCode: number; stderr: string };

export type ContainerRuntime = {
  /** Creates volumes and a stopped container; idempotent. */
  create(spec: TicketContainerSpec): Promise<void>;
  start(name: string): Promise<void>;
  stop(name: string): Promise<void>;
  /** Removes the container and, when `volumes` is true, its HOME and workspace volumes. */
  remove(name: string, volumes?: { home: string; workspace: string }): Promise<void>;
  isRunning(name: string): Promise<boolean>;
  /** Streams stdout line by line; the generator returns the exit result. */
  exec(name: string, command: string[], options?: ExecOptions): AsyncGenerator<string, ExecResult>;
  /** Copies a host directory's contents into the container and gives them to the agent user. */
  copyIn(name: string, hostDir: string, containerDir: string): Promise<void>;
  /** Copies one file out of the container to a host path. */
  copyOut(name: string, containerPath: string, hostPath: string): Promise<void>;
  /** Writes a file inside the container (used to seed credentials into the HOME volume). */
  writeFile(name: string, containerPath: string, content: string, mode?: string): Promise<void>;
};
