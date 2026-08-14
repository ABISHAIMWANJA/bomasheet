import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IAiFieldOptions, IFieldVo } from '@teable/core';
import { FieldKeyType, FieldType } from '@teable/core';
import { FieldService } from '../field/field.service';
import { RecordService } from '../record/record.service';
import { RecordOpenApiService } from '../record/open-api/record-open-api.service';

/**
 * Substitutes {fieldName} placeholders in a prompt with the record's current
 * values for those fields. A referenced field with no value becomes an empty
 * string rather than leaving the literal placeholder in the prompt.
 */
export function renderAiPrompt(
  prompt: string,
  fields: Record<string, unknown>
): string {
  return prompt.replace(/\{([^{}]+)\}/g, (match, fieldName: string) => {
    if (!(fieldName in fields)) {
      return match;
    }
    const value = fields[fieldName];
    if (value == null) {
      return '';
    }
    return Array.isArray(value) ? value.join(', ') : String(value);
  });
}

@Injectable()
export class AiFieldService {
  constructor(
    private readonly configService: ConfigService,
    private readonly fieldService: FieldService,
    private readonly recordService: RecordService,
    private readonly recordOpenApiService: RecordOpenApiService
  ) {}

  private async loadAiField(tableId: string, fieldId: string): Promise<IFieldVo> {
    const field = await this.fieldService.getField(tableId, fieldId);
    if (field.type !== FieldType.Ai) {
      throw new BadRequestException(`Field ${fieldId} is not an AI field`);
    }
    return field;
  }

  private async complete(prompt: string, model?: string): Promise<string> {
    const endpoint = this.configService.get<string>('OPENAI_API_ENDPOINT');
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!endpoint || !apiKey) {
      throw new InternalServerErrorException(
        'OPENAI_API_ENDPOINT or OPENAI_API_KEY is not configured'
      );
    }

    const res = await fetch(`${endpoint.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || this.configService.get<string>('AI_FIELD_MODEL') || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new InternalServerErrorException(`AI provider error (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (content == null) {
      throw new InternalServerErrorException('AI provider returned no content');
    }
    return content;
  }

  /**
   * Generates a value for one AI field on one record, synchronously, and
   * writes it back through the normal record-update path -- the same path a
   * user's manual cell edit takes, so any formula/rollup field that depends
   * on this one recalculates through the existing calculation engine without
   * this service needing to know anything about it.
   */
  async generate(tableId: string, recordId: string, fieldId: string): Promise<string> {
    const field = await this.loadAiField(tableId, fieldId);
    const options = field.options as IAiFieldOptions;

    // No projection: sourceFieldIds holds field IDs (for the prompt-builder UI
    // to offer as suggestions), but {placeholders} in the prompt are matched
    // by name, so the full name-keyed record is fetched rather than trying to
    // reconcile an ID-keyed projection against name-keyed substitution.
    const record = await this.recordService.getRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Name,
    });

    const prompt = renderAiPrompt(options.prompt, record.fields);
    const generated = await this.complete(prompt, options.model);

    await this.recordOpenApiService.updateRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Id,
      typecast: true,
      record: { fields: { [fieldId]: generated } },
    });

    return generated;
  }
}
