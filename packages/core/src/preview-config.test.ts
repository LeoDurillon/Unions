import { expect, test } from 'bun:test';

import {
  exposedServices,
  previewUrlVariables,
  renderPreviewTemplate,
  templateProblems,
  type TemplateContext,
} from './preview-config';

const SERVICES = [
  { name: 'web', port: 3000, prefix: '' },
  { name: 'api', port: 8080, prefix: 'api' },
];
const CONTEXT: TemplateContext = {
  owner: { ticketId: 12 },
  prNumber: null,
  publicPort: 8080,
  exposed: SERVICES,
};

test('phase 1 settings read as one exposed service on the main host', () => {
  expect(exposedServices({ composeFile: 'c.yaml', env: {}, service: 'web', port: 80 })).toEqual([
    { name: 'web', port: 80, prefix: '' },
  ]);
  expect(exposedServices({ composeFile: 'c.yaml', env: {}, services: SERVICES })).toBe(SERVICES);
});

test('templates fill in addresses from the browser and from inside the environment', () => {
  expect(renderPreviewTemplate('{service.api.url}/v1', CONTEXT)).toBe(
    'http://api-t12.union.localhost:8080/v1',
  );
  expect(renderPreviewTemplate('{service.api.internal}', CONTEXT)).toBe('http://api:8080');
  expect(renderPreviewTemplate('postgres://{service.db.host}:5432', CONTEXT)).toBe(
    'postgres://db:5432',
  );
  expect(renderPreviewTemplate('t{ticket.id} {preview.host} {preview.url}', CONTEXT)).toBe(
    't12 t12.union.localhost http://t12.union.localhost:8080',
  );
  expect(renderPreviewTemplate('{service.web.url}', { ...CONTEXT, publicPort: 80 })).toBe(
    'http://t12.union.localhost',
  );
});

test("a pull request under review's templates use its review id and its number", () => {
  const review: TemplateContext = { ...CONTEXT, owner: { reviewId: 3 }, prNumber: 1582 };
  expect(renderPreviewTemplate('db_{ticket.id} #{pr.number} {service.api.url}', review)).toBe(
    'db_r3 #1582 http://api-r3.union.localhost:8080',
  );
  expect(renderPreviewTemplate('#{pr.number}', CONTEXT)).toBe('#');
  expect(templateProblems('{pr.number}', SERVICES)).toEqual([]);
});

test('unknown templates and services not exposed are reported', () => {
  expect(templateProblems('{service.api.url} {service.db.host}', SERVICES)).toEqual([]);
  expect(templateProblems('{service.db.url}', SERVICES)).toEqual([
    '{service.db.url}: that service is not exposed',
  ]);
  expect(templateProblems('{ticket.title}', SERVICES)).toEqual([
    '{ticket.title} is not a template',
  ]);
  // JSON-looking values are not templates.
  expect(templateProblems('{"a": 1}', SERVICES)).toEqual([]);
});

test("each service's public address is in a UNION_URL_ variable named after it", () => {
  expect(
    previewUrlVariables([
      { service: 'api', url: 'http://api-t12.union.localhost:8080' },
      { service: 'back-office.v2', url: 'http://bo-t12.union.localhost:8080' },
    ]),
  ).toEqual({
    UNION_URL_API: 'http://api-t12.union.localhost:8080',
    UNION_URL_BACK_OFFICE_V2: 'http://bo-t12.union.localhost:8080',
  });
});
