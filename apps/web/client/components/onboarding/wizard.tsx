// Step-by-step project setup, shown over the board (the first thing a new user sees).

import { useState, type ReactElement } from 'react';

import { DiscardQuestion } from '../ui/dialog';
import { CloseButton, ErrorText } from '../ui/ui';
import { ConnectStep } from './connect-step';
import { useFinish, type Created } from './create-project';
import { canContinue, EMPTY_DRAFT, STEPS, type Draft, type StepProps } from './draft';
import { Stepper } from './stepper';
import { STEP_VIEWS } from './steps';
import { Footer, SetupNotStarted, WizardDialog } from './wizard-frame';

const LAST = STEPS.length - 1;

/** Something entered that closing would lose: a step passed, or a choice made on the first. */
function touched(step: number, draft: Draft): boolean {
  return step > 0 || JSON.stringify(draft) !== JSON.stringify(EMPTY_DRAFT);
}

/**
 * Closing the wizard (Escape or ✕): nothing while the project is being created, to the project once
 * created, and a question first over choices made.
 */
function useClose(
  onClose: (() => void) | undefined,
  onFinished: (projectId: number) => void,
  state: { pending: boolean; created: Created | null; touched: boolean },
): { asking: boolean; handleRequest: () => void; handleKeep: () => void } {
  const [asking, setAsking] = useState(false);
  const handleRequest = (): void => {
    if (state.pending) {
      return;
    }
    if (state.created) {
      onFinished(state.created.projectId);
    } else if (state.touched && onClose) {
      setAsking(true);
    } else {
      onClose?.();
    }
  };
  return {
    asking,
    handleRequest,
    handleKeep: () => {
      setAsking(false);
    },
  };
}

/** The stepper, with ✕ when the wizard can be closed now. */
function WizardTop({ step, onClose }: { step: number; onClose?: () => void }): ReactElement {
  return (
    <div className="flex items-center gap-2 rounded-t-2xl border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <Stepper current={step} />
      {onClose ? <CloseButton onClick={onClose} /> : null}
    </div>
  );
}

function WizardHeading({ step }: { step: number }): ReactElement {
  const header = STEPS[step] ?? STEPS[0];
  return (
    <header>
      <h2 id="wizard-title" className="text-xl font-semibold tracking-tight">
        {header.title}
      </h2>
      <p className="text-sm text-zinc-500">{header.description}</p>
    </header>
  );
}

/** The draft the steps fill, and how they change it. */
function useDraft(): StepProps {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  return {
    draft,
    patch: (change) => {
      setDraft((previous) => ({ ...previous, ...change }));
    },
  };
}

export function Wizard({
  onFinished,
  onClose,
}: {
  onFinished: (projectId: number) => void;
  onClose?: () => void;
}): ReactElement {
  const [step, setStep] = useState(0);
  const props = useDraft();
  const { draft } = props;
  const { finish, pending, error, created } = useFinish(onFinished);
  const close = useClose(onClose, onFinished, { pending, created, touched: touched(step, draft) });
  const View = STEP_VIEWS[step] ?? ConnectStep;

  return (
    <WizardDialog onClose={close.handleRequest}>
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <WizardTop step={step} onClose={onClose && !pending ? close.handleRequest : undefined} />
        <div className="flex flex-col gap-5 p-6">
          {close.asking && onClose ? (
            <DiscardQuestion
              question="Discard this new project and what you entered?"
              onDiscard={onClose}
              onKeep={close.handleKeep}
            />
          ) : null}
          <WizardHeading step={step} />
          {created?.setupError ? (
            <SetupNotStarted
              reason={created.setupError}
              onOpen={() => {
                onFinished(created.projectId);
              }}
            />
          ) : (
            <View {...props} />
          )}
          <ErrorText error={error} />
        </div>
        {created ? null : (
          <Footer
            last={step === LAST}
            canBack={step > 0}
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
        )}
      </div>
    </WizardDialog>
  );
}
