// The heavy pages, loaded only when first opened (the review page, both settings, usage, the
// guide). Each has the same name and props as the page itself.

import { lazy, Suspense, type ComponentProps, type ReactElement } from 'react';

import type { GuidePage as GuidePageEager } from '../guide/guide-page';
import type { ReviewPage as ReviewPageEager } from '../review/review-page';
import type { ProjectSettingsPage as ProjectSettingsEager } from '../settings/settings-page';
import type { UnionSettingsPage as UnionSettingsEager } from '../union-settings/union-settings-page';
import type { UsagePage as UsagePageEager } from '../usage/usage-page';

export type { ReviewSection } from '../review/review-page';

const Review = lazy(async () => {
  const { ReviewPage: page } = await import('../review/review-page');
  return { default: page };
});
const ProjectSettings = lazy(async () => {
  const { ProjectSettingsPage: page } = await import('../settings/settings-page');
  return { default: page };
});
const UnionSettings = lazy(async () => {
  const { UnionSettingsPage: page } = await import('../union-settings/union-settings-page');
  return { default: page };
});
const Usage = lazy(async () => {
  const { UsagePage: page } = await import('../usage/usage-page');
  return { default: page };
});
const Guide = lazy(async () => {
  const { GuidePage: page } = await import('../guide/guide-page');
  return { default: page };
});

/** What shows while a page's code loads, the first time it opens. */
function Loading(): ReactElement {
  return <output className="block p-4 text-sm text-zinc-500">Loading…</output>;
}

export function ReviewPage(props: ComponentProps<typeof ReviewPageEager>): ReactElement {
  return (
    <Suspense fallback={<Loading />}>
      <Review {...props} />
    </Suspense>
  );
}

export function ProjectSettingsPage(
  props: ComponentProps<typeof ProjectSettingsEager>,
): ReactElement {
  return (
    <Suspense fallback={<Loading />}>
      <ProjectSettings {...props} />
    </Suspense>
  );
}

export function UnionSettingsPage(props: ComponentProps<typeof UnionSettingsEager>): ReactElement {
  return (
    <Suspense fallback={<Loading />}>
      <UnionSettings {...props} />
    </Suspense>
  );
}

export function UsagePage(props: ComponentProps<typeof UsagePageEager>): ReactElement {
  return (
    <Suspense fallback={<Loading />}>
      <Usage {...props} />
    </Suspense>
  );
}

export function GuidePage(props: ComponentProps<typeof GuidePageEager>): ReactElement {
  return (
    <Suspense fallback={<Loading />}>
      <Guide {...props} />
    </Suspense>
  );
}
