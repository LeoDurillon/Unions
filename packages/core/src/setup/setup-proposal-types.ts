// What the setup agent proposes for a project's settings, section by section, as Union reads it back; browser-safe.
import type { PreviewService, ProjectScript, SharedServiceCommands } from '../schema/schema-types';

export type SetupChecks = { installCommand: string; gateCommand: string; why: string };

export type SetupScripts = { items: ProjectScript[]; why: string };

/** The preview settings it proposes; the ones it leaves out stay as they are. */
export type SetupPreview = {
  composeFile: string;
  /** YAML merged over the repository's file: what makes a dev compose file run as a preview. */
  composeAdditions: string;
  services: PreviewService[];
  /** Plain variables only, templates allowed (`{service.api.url}`); secrets are named in `secrets`. */
  env: Record<string, string>;
  agentServices: string[];
  sharedServices: string[];
  /** Per shared service, what keeps each preview's data apart (`createdb app_{ticket.id}`). */
  sharedCommands: SharedServiceCommands[];
  profiles: string[];
  forwardPorts: boolean | null;
  startForImplementation: boolean | null;
  why: string;
};

export type SetupText = { text: string; why: string };

/** A secret variable the preview needs: its name and where to get its value, never the value. */
export type SetupSecret = { name: string; where: string };

/** A file the user must give the project (Project → Files): its path and what goes in it. */
export type SetupProjectFile = { path: string; what: string };

/** A change the repository itself needs: a ticket the user may create. */
export type SetupTicket = { title: string; description: string };

export type SetupProposal = {
  summary: string;
  checks: SetupChecks | null;
  scripts: SetupScripts | null;
  preview: SetupPreview | null;
  /** The e2e command, run against the preview. */
  e2e: SetupText | null;
  secrets: SetupSecret[];
  projectFiles: SetupProjectFile[];
  /** A draft of the project instructions. */
  instructions: SetupText | null;
  /** A Dockerfile on the base image, when the default image lacks a toolchain. */
  agentImage: SetupText | null;
  tickets: SetupTicket[];
  /** What the agent could not decide. */
  questions: string[];
  /** Values Union refused, each with why: shown so the user knows what is missing. */
  dropped: string[];
};
