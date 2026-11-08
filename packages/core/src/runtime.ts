// Everything the worker needs from Docker. Swap the CLI implementation for the Engine API without
// touching callers.

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
  /** The image's user when absent; `root` only for what the agent must not change itself. */
  user?: string;
};

export type ExecResult = { exitCode: number; stderr: string };

/** A short-lived container the worker runs a command in, removed when it ends (`docker run --rm`). */
export type HelperSpec = {
  image: string;
  command: string[];
  /** `source` is a volume name or a host path (the Docker socket). */
  mounts?: { source: string; target: string }[];
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  signal?: AbortSignal;
  /** Files written inside the helper before the command runs (not in any volume). */
  files?: { path: string; content: string }[];
};

/** A container of a compose project, as `docker ps -a` lists it. */
export type ProjectContainer = { service: string; running: boolean; exitCode: number | null };

export type ContainerRuntime = {
  /**
   * Creates volumes and a stopped container; idempotent. A stopped container from an older image is
   * created again from the current one, on the same volumes.
   */
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
  /**
   * Copies host files into a volume, each to its path there (folders must exist), through a
   * container of `image` that is created for it and never started.
   */
  copyIntoVolume(
    volume: string,
    image: string,
    files: { hostPath: string; volumePath: string }[],
  ): Promise<void>;
  /**
   * Copies one file out of the container to a host path. Throws `CopyRefused` (and leaves nothing
   * there) when it is not a regular file, or is larger than `maxBytes`.
   */
  copyOut(name: string, containerPath: string, hostPath: string, maxBytes?: number): Promise<void>;
  /** Writes a file inside the container (used to seed credentials into the HOME volume). */
  writeFile(name: string, containerPath: string, content: string, mode?: string): Promise<void>;
  /** Runs a helper container; streams its output (stdout and stderr) line by line. */
  runHelper(spec: HelperSpec): AsyncGenerator<string, ExecResult>;
  networkExists(name: string): Promise<boolean>;
  /** The networks of a compose project (by its label), for an outside container to join. */
  projectNetworks(project: string): Promise<string[]>;
  /** Every container of a compose project (by its label), running or not. */
  projectContainers(project: string): Promise<ProjectContainer[]>;
  /** The containers of a compose service (`proxy`) on a network, by name. */
  serviceContainers(network: string, service: string): Promise<string[]>;
  /** Joins or leaves a network; already joined or already left is not an error. */
  connectNetwork(network: string, container: string): Promise<void>;
  disconnectNetwork(network: string, container: string): Promise<void>;
};

/** An image as `docker image inspect` reports it. */
export type ImageInfo = { id: string; sizeBytes: number };

/** What the worker needs from Docker for the projects' own agent images (`DockerImages`). */
export type ImageRuntime = {
  /** Null when there is no image by that name. */
  inspect(ref: string): Promise<ImageInfo | null>;
  /**
   * Builds `dockerfile` with no context (`docker build -`), tagged `tag`; streams the output, stdout
   * and stderr together. Aborting `signal` stops the build.
   */
  build(spec: {
    tag: string;
    dockerfile: string;
    signal: AbortSignal;
  }): AsyncGenerator<string, ExecResult>;
  /** Pulls an image built elsewhere; streams the output. */
  pull(ref: string, signal: AbortSignal): AsyncGenerator<string, ExecResult>;
  /** The tags of a repository's images (`union-agent-p3:<hash>`). */
  tags(repository: string): Promise<string[]>;
  /** Removes a tag; one a container still uses is kept, and that is not an error. */
  remove(ref: string): Promise<void>;
};
