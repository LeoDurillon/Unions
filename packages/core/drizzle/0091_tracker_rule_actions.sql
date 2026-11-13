-- Rule actions on a tracker name it: `notion_property`, `jira_transition`, `jira_field` and `jira_comment` become
-- `tracker_fields`, `tracker_status` and `tracker_comment` with `tracker`. A Notion value's `propertyId` becomes
-- `fieldId`, with the property's name and type from the data source as last read ('' when it is gone from it).
UPDATE `event_rules`
SET `action` = json_object(
  'kind', 'tracker_fields',
  'tracker', 'notion',
  'values', json(coalesce((
    SELECT json_group_array(json_object(
      'fieldId', coalesce(json_extract(`v`.`value`, '$.propertyId'), ''),
      'fieldName', coalesce((
        SELECT json_extract(`p`.`value`, '$.name')
        FROM `integrations` AS `i`, json_each(`i`.`fields`, '$.properties') AS `p`
        WHERE `i`.`project_id` = `event_rules`.`project_id` AND `i`.`kind` = 'notion'
          AND json_extract(`p`.`value`, '$.id') = json_extract(`v`.`value`, '$.propertyId')
      ), ''),
      'fieldType', coalesce((
        SELECT json_extract(`p`.`value`, '$.type')
        FROM `integrations` AS `i`, json_each(`i`.`fields`, '$.properties') AS `p`
        WHERE `i`.`project_id` = `event_rules`.`project_id` AND `i`.`kind` = 'notion'
          AND json_extract(`p`.`value`, '$.id') = json_extract(`v`.`value`, '$.propertyId')
      ), ''),
      'value', coalesce(json_extract(`v`.`value`, '$.value'), '')
    ))
    FROM json_each(`event_rules`.`action`, '$.values') AS `v`
  ), '[]'))
)
WHERE json_extract(`action`, '$.kind') = 'notion_property';
--> statement-breakpoint
UPDATE `event_rules`
SET `action` = json_set(`action`, '$.kind', 'tracker_status', '$.tracker', 'jira')
WHERE json_extract(`action`, '$.kind') = 'jira_transition';
--> statement-breakpoint
UPDATE `event_rules`
SET `action` = json_set(`action`, '$.kind', 'tracker_fields', '$.tracker', 'jira')
WHERE json_extract(`action`, '$.kind') = 'jira_field';
--> statement-breakpoint
UPDATE `event_rules`
SET `action` = json_set(`action`, '$.kind', 'tracker_comment', '$.tracker', 'jira')
WHERE json_extract(`action`, '$.kind') = 'jira_comment';
