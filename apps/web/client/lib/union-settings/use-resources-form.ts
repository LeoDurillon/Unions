// The Resources page's form: how much memory each agent container and each preview service may use, saved together.

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { UnionSettingsView } from '../../../src/routes/union-settings';
import { request } from '../app/api';
import { useSettingsForm, type SettingsForm } from '../settings/use-settings-form';

const KEY = ['union-settings'];

export function useUnionSettings(): UseQueryResult<UnionSettingsView> {
  return useQuery({
    queryKey: KEY,
    queryFn: () => request<UnionSettingsView>('GET', '/api/union-settings'),
  });
}

export function useResourcesForm(saved: UnionSettingsView): SettingsForm<UnionSettingsView> {
  const queryClient = useQueryClient();
  return useSettingsForm(
    () => saved,
    async (value) => {
      try {
        await request('PUT', '/api/union-settings', value);
      } finally {
        await queryClient.invalidateQueries({ queryKey: KEY });
      }
    },
  );
}
