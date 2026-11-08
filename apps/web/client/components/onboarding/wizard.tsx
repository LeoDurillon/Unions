// Step-by-step project setup, shown over the board (the first thing a new user sees).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';

import { api } from '../../lib/api';
import { Button, CloseButton, ErrorText } from '../ui';
import { ConnectStep } from './connect-step';
import {
  canContinue,
  credentialOf,
  EMPTY_DRAFT,
  STEPS,
  verifiedTrackers,
  type Draft,
  type StepProps,
} from './draft';
import { Stepper } from './stepper';
import { STEP_VIEWS } from './steps';

const LAST = STEPS.length - 1;

/** The new project's GitHub Project node id: none, the one picked, or one created now. */
async function boardOf(draft: Draft): Promise<string | undefined> {
  const { repo, project } = draft;
  if (!repo || project === null) {
    return undefined;
  }
  if (project.kind === 'existing') {
    return project.project.id;
  }
  const created = await api.github.createProject(credentialOf(draft), {
    ownerId: repo.ownerNodeId,
    repositoryId: repo.nodeId,
    title: project.title.trim(),
  });
  return created.id;
}

async function createFrom(draft: Draft): Promise<number> {
  const { repo } = draft;
  if (!repo) {
    throw new Error('Pick a repository first.');
  }
  const githubProjectNodeId = await boardOf(draft);
  const created = await api.createProject({
    owner: repo.owner,
    repo: repo.name,
    baseBranch: draft.baseBranch.trim(),
    ...credentialOf(draft),
    ...(githubProjectNodeId === undefined ? {} : { githubProjectNodeId }),
    integrations: verifiedTrackers(draft),
  });
  return created.id;
}

function useFinish(onFinished: (projectId: number) => void): {
  finish: (draft: Draft) => void;
  pending: boolean;
  error: Error | null;
} {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: createFrom,
    onSuccess: async (projectId) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      onFinished(projectId);
    },
  });
  return { finish: mutation.mutate, pending: mutation.isPending, error: mutation.error };
}

function Footer({
  step,
  canNext,
  pending,
  onPrev,
  onNext,
}: {
  step: number;
  canNext: boolean;
  pending: boolean;
  onPrev: () => void;
  onNext: () => void;
}): ReactElement {
  const last = step === LAST;
  const label = last ? 'Create project' : 'Next';
  return (
    <footer className="flex items-center justify-between">
      {step > 0 ? <Button onClick={onPrev}>Prev</Button> : <span />}
      <Button variant="primary" disabled={!canNext || pending} onClick={onNext}>
        {pending ? 'Creating…' : label}
      </Button>
    </footer>
  );
}

/** Step-by-step project setup, shown over the board (the first thing a new user sees). */
/** Opens the dialog as a modal once mounted, and closes it on unmount. */
function useModal(): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    return () => {
      dialog?.close();
    };
  }, []);
  return ref;
}

/** The wizard's frame: a modal dialog (focus kept inside, the page behind inert), closed by Escape when it can be. */
function WizardDialog({
  onClose,
  children,
}: {
  onClose?: () => void;
  children: ReactNode;
}): ReactElement {
  const dialog = useModal();
  return (
    <dialog
      ref={dialog}
      aria-labelledby="wizard-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
      className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 text-zinc-900 backdrop:bg-black/10 backdrop:backdrop-blur-sm dark:text-zinc-100"
    >
      <div className="flex min-h-full flex-col items-center gap-5 px-4 pt-16 pb-8">{children}</div>
    </dialog>
  );
}

export function Wizard({
  onFinished,
  onClose,
}: {
  onFinished: (projectId: number) => void;
  onClose?: () => void;
}): ReactElement {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const { finish, pending, error } = useFinish(onFinished);
  const header = STEPS[step] ?? STEPS[0];
  const View = STEP_VIEWS[step] ?? ConnectStep;
  const props: StepProps = {
    draft,
    patch: (change) => {
      setDraft((previous) => ({ ...previous, ...change }));
    },
  };

  return (
    <WizardDialog onClose={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow dark:bg-zinc-900">
        <Stepper current={step} />
      </div>
      <div className="flex w-full max-w-2xl flex-col gap-5 rounded-xl bg-white p-6 shadow dark:bg-zinc-900">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="wizard-title" className="text-xl font-semibold">
              {header.title}
            </h2>
            <p className="text-sm text-zinc-500">{header.description}</p>
          </div>
          {onClose ? <CloseButton onClick={onClose} /> : null}
        </header>
        <View {...props} />
        <ErrorText error={error} />
        <Footer
          step={step}
          canNext={canContinue(step, draft)}
          pending={pending}
          onPrev={() => {
            setStep(step - 1);
          }}
          onNext={() => {
            if (step === LAST) {
              finish(draft);
            } else {
              setStep(step + 1);
            }
          }}
        />
      </div>
    </WizardDialog>
  );
}
