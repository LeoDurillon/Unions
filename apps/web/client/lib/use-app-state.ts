// What the root layout runs on: live refetching, the projects, the open ticket, navigation, and opening notifications.
import { useDesktopNotifications } from './desktop-notifications';
import { useNotificationOpener, type NotificationTarget } from './open-notification';
import { useActiveProject } from './use-active-project';
import { useLiveInvalidation } from './use-live-invalidation';
import { useNavigation } from './use-navigation';
import { useProjectJump } from './use-project-jump';
import { useSelectedTicket } from './use-selected-ticket';

export type AppState = ReturnType<typeof useActiveProject> &
  ReturnType<typeof useNavigation> & {
    ticketId: number | null;
    openTicket: (id: number | null) => void;
    openNotification: (target: NotificationTarget) => void;
    /** A ticket of any project, from a page listing several projects' (the running previews). */
    openProjectTicket: (projectId: number, ticketId: number) => void;
    /** Another project's board, as the sidebar opens it (unsaved changes asked about first). */
    selectProject: (id: number) => void;
  };

/** Also shows the desktop notifications, when the user turned them on. */
export function useAppState(): AppState {
  useLiveInvalidation();
  const projects = useActiveProject();
  const [ticketId, openTicket] = useSelectedTicket();
  const navigation = useNavigation();
  const openNotification = useNotificationOpener({
    leave: navigation.leave,
    selectProject: projects.select,
    showBoard: navigation.goTo('board'),
    openTicket,
  });
  useDesktopNotifications(openNotification);
  const openProjectTicket = (projectId: number, id: number): void => {
    if (navigation.leave()) {
      projects.select(projectId);
      navigation.goTo('board')();
      openTicket(id);
    }
  };
  const selectProject = (id: number): void => {
    if (navigation.leave()) {
      projects.select(id);
      navigation.goTo('board')();
    }
  };
  const current = projects.projects.find((listed) => listed.id === projects.project?.id) ?? null;
  useProjectJump(
    projects.projects,
    current,
    selectProject,
    navigation.page === 'board' && ticketId === null,
  );
  return {
    ...projects,
    ...navigation,
    ticketId,
    openTicket,
    openNotification,
    openProjectTicket,
    selectProject,
  };
}
