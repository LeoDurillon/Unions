-- A Notion rule action sets a list of properties: { kind, values: [{ propertyId, value }] }.
-- Rules saved before hold one { propertyId, value }, and the oldest ones have no kind.
UPDATE `event_rules`
SET `action` = json_object(
  'kind', 'notion_property',
  'values', json_array(json_object(
    'propertyId', coalesce(json_extract(`action`, '$.propertyId'), ''),
    'value', coalesce(json_extract(`action`, '$.value'), '')
  ))
)
WHERE coalesce(json_extract(`action`, '$.kind'), 'notion_property') = 'notion_property'
  AND json_extract(`action`, '$.values') IS NULL;
