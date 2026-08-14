import { config } from './config';
import type { BomaSheetClient } from './bomasheet-client';
import { toolDefinitions, runTool } from './tools';

interface IChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  // eslint-disable-next-line @typescript-eslint/naming-convention
  tool_call_id?: string;
}

const SYSTEM_PROMPT =
  "You are BomaClaw, a chat assistant that reads and edits a user's BomaSheet " +
  'data through tool calls. Always call list_tables before assuming a table exists, ' +
  'and list_fields before create_record or update_record so field names match exactly. ' +
  "Keep replies short and conversational -- this is a chat, not a report.";

async function chatCompletion(messages: IChatMessage[]): Promise<{
  content: string | null;
  toolCalls: IChatMessage['tool_calls'];
}> {
  const res = await fetch(`${config.openaiApiEndpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: config.aiModel,
      messages,
      tools: toolDefinitions,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AI provider error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: IChatMessage['tool_calls'] } }[];
  };
  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error('AI provider returned no message');
  }
  return { content: message.content ?? null, toolCalls: message.tool_calls };
}

/**
 * Runs the tool-calling loop for one user turn: send history to the model,
 * execute any tool calls it requests, feed results back, repeat until it
 * answers in plain text or maxToolIterations is hit.
 */
export async function respond(
  client: BomaSheetClient,
  history: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const messages: IChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
  ];

  for (let i = 0; i < config.maxToolIterations; i++) {
    const { content, toolCalls } = await chatCompletion(messages);

    if (!toolCalls || toolCalls.length === 0) {
      return content ?? "I don't have a response for that.";
    }

    messages.push({ role: 'assistant', content, tool_calls: toolCalls });

    for (const call of toolCalls) {
      const result = await runTool(client, call.function.name, call.function.arguments);
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }

  return "That took more steps than I'm allowed -- try asking in a more specific way.";
}
