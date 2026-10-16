// What the root layout runs on: live refetching, the projects, the open ticket, navigation, and opening notifications.
import { useDesktopNotifications } from './desktop-notifications';
import { useNotificationOpener, type NotificationTarget } from './open-notification';
import { useActiveProject } from './use-active-project';
import { useLiveInvalidation } from './use-live-invalidation';
import { useNavigation } from './use-navigation';
import { useSelectedTicket } from './use-selected-ticket';

export type AppState = ReturnType<typeof useActiveProject> &
  ReturnType<typeof useNavigation> & {
    ticketId: number | null;
    openTicket: (id: number | null) => void;
    openNotification: (target: NotificationTarget) => void;
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
  return { ...projects, ...navigation, ticketId, openTicket, openNotification };
}
