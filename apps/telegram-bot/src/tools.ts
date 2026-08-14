import type { BomaSheetClient } from './bomasheet-client';

export const toolDefinitions = [
  {
    type: 'function' as const,
    function: {
      name: 'list_bases',
      description: "List the BomaSheet bases (databases) this user has access to.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_tables',
      description: 'List the tables inside a base.',
      parameters: {
        type: 'object',
        properties: { baseId: { type: 'string' } },
        required: ['baseId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_fields',
      description:
        "List a table's fields with their names and types. Call this before creating or " +
        'updating a record, so field names in the payload match exactly.',
      parameters: {
        type: 'object',
        properties: { tableId: { type: 'string' } },
        required: ['tableId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_records',
      description: 'List records in a table, most recent first.',
      parameters: {
        type: 'object',
        properties: {
          tableId: { type: 'string' },
          take: { type: 'number', description: 'Max records to return, default 20, max 100.' },
        },
        required: ['tableId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_record',
      description: 'Create one record in a table. Field names must match list_fields exactly.',
      parameters: {
        type: 'object',
        properties: {
          tableId: { type: 'string' },
          fields: { type: 'object', description: 'Field name -> value.' },
        },
        required: ['tableId', 'fields'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_record',
      description: 'Update fields on one existing record.',
      parameters: {
        type: 'object',
        properties: {
          tableId: { type: 'string' },
          recordId: { type: 'string' },
          fields: { type: 'object', description: 'Field name -> new value, only changed fields.' },
        },
        required: ['tableId', 'recordId', 'fields'],
      },
    },
  },
];

/**
 * Executes one tool call against BomaSheet on behalf of the requesting user.
 * Never throws: a failed call becomes a string the model can read and react
 * to (e.g. "that table doesn't exist, let me list tables instead") rather
 * than crashing the whole conversation turn.
 */
export async function runTool(
  client: BomaSheetClient,
  name: string,
  rawArgs: string
): Promise<string> {
  try {
    const args = rawArgs ? JSON.parse(rawArgs) : {};
    switch (name) {
      case 'list_bases':
        return JSON.stringify(await client.listBases());
      case 'list_tables':
        return JSON.stringify(await client.listTables(args.baseId));
      case 'list_fields':
        return JSON.stringify(await client.listFields(args.tableId));
      case 'list_records':
        return JSON.stringify(await client.listRecords(args.tableId, args.take ?? 20));
      case 'create_record':
        return JSON.stringify(await client.createRecord(args.tableId, args.fields));
      case 'update_record':
        return JSON.stringify(
          await client.updateRecord(args.tableId, args.recordId, args.fields)
        );
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}
