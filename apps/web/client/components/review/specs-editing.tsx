// Whether the review's specs dialog is open, shared by the Specs bar and the agent actions' dialogs
// (their "Edit the specs" opens it).
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

type SpecsEditing = { editing: boolean; setEditing: (editing: boolean) => void };

const SpecsEditingContext = createContext<SpecsEditing | null>(null);

/** The dialog's state; null outside a review page. */
export function useSpecsEditing(): SpecsEditing | null {
  return useContext(SpecsEditingContext);
}

export function SpecsEditingProvider({ children }: { children: ReactNode }): ReactElement {
  const [editing, setEditing] = useState(false);
  const value = useMemo(() => ({ editing, setEditing }), [editing]);
  return <SpecsEditingContext.Provider value={value}>{children}</SpecsEditingContext.Provider>;
}
