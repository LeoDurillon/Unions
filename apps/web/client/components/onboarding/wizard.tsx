// Step-by-step project setup, shown over the board (the first thing a new user sees).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import { api } from '../../lib/api';
import { Button, ErrorText } from '../ui';
import { ConnectStep } from './connect-step';
import { canContinue, credentialOf, EMPTY_DRAFT, STEPS, type Draft, type StepProps } from './draft';
import { Stepper } from './stepper';
import { STEP_VIEWS } from './steps';

const LAST = STEPS.length - 1;

async function createFrom(draft: Draft): Promise<number> {
  const { repo, project } = draft;
  if (!repo || !project) {
    throw new Error('Pick a repository and a project first.');
  }
  let githubProjectNodeId = '';
  if (project.kind === 'existing') {
    githubProjectNodeId = project.project.id;
  } else {
    const created = await api.github.createProject(credentialOf(draft), {
      ownerId: repo.ownerNodeId,
      repositoryId: repo.nodeId,
      title: project.title.trim(),
    });
    githubProjectNodeId = created.id;
  }
  const created = await api.createProject({
    owner: repo.owner,
    repo: repo.name,
    baseBranch: draft.baseBranch.trim(),
    ...credentialOf(draft),
    githubProjectNodeId,
    ...(draft.notionTitle === null
      ? {}
      : {
          notionToken: draft.notionToken.trim(),
          notionDataSourceId: draft.notionDataSourceId.trim(),
        }),
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
    <section className="fixed inset-0 z-20 flex flex-col items-center gap-5 overflow-y-auto bg-black/10 px-4 pt-16 pb-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow dark:bg-zinc-900">
        <Stepper current={step} />
      </div>
      <div className="flex w-full max-w-2xl flex-col gap-5 rounded-xl bg-white p-6 shadow dark:bg-zinc-900">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{header.title}</h2>
            <p className="text-sm text-zinc-500">{header.description}</p>
          </div>
          {onClose ? <Button onClick={onClose}>Close</Button> : null}
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
    </section>
  );
}
