// Import the openapi-extended zod, not bare 'zod'. `.openapi()` is a prototype
// extension applied by packages/core/src/zod.ts via extendZodWithOpenApi();
// bare 'zod' only has it once some other module has already triggered that
// side effect. Sibling field files import bare 'zod' and happen to work
// because they load later -- this file is exported first from ./index.ts, so
// it would crash at require time with "z.string(...).min(...).openapi is not
// a function". Importing the extended module makes load order irrelevant.
import type { CellValueType, FieldType } from '../constant';
import { FieldCore } from '../field';
import { z } from '../../../zod';

export const aiFieldOptionsSchema = z.object({
  prompt: z.string().min(1).openapi({
    description:
      'Prompt sent to the model. Reference another field\'s current value with {fieldName}; ' +
      'the value is substituted in at generation time.',
    example: 'Summarize this in one sentence: {Description}',
  }),
  sourceFieldIds: z.array(z.string()).openapi({
    description: 'Fields whose current values may be substituted into the prompt.',
  }),
  model: z.string().optional().openapi({
    description:
      'Overrides the default chat-completions model. Falls back to AI_FIELD_MODEL, then gpt-3.5-turbo.',
  }),
});

export type IAiFieldOptions = z.infer<typeof aiFieldOptionsSchema>;

export const aiCellValueSchema = z.string();

export type IAiCellValue = z.infer<typeof aiCellValueSchema>;

export class AiFieldCore extends FieldCore {
  type!: FieldType.Ai;

  options!: IAiFieldOptions;

  cellValueType!: CellValueType.String;

  static defaultOptions(): IAiFieldOptions {
    return { prompt: '', sourceFieldIds: [] };
  }

  cellValue2String(cellValue?: unknown) {
    if (this.isMultipleCellValue && Array.isArray(cellValue)) {
      return cellValue.join(', ');
    }
    return (cellValue as string) ?? '';
  }

  item2String(value?: unknown): string {
    return value ? String(value) : '';
  }

  convertStringToCellValue(value: string): string | null {
    if (this.isLookup) {
      return null;
    }
    if (value === '' || value == null) {
      return null;
    }
    return value;
  }

  repair(value: unknown) {
    if (this.isLookup) {
      return null;
    }
    if (typeof value === 'string') {
      return this.convertStringToCellValue(value);
    }
    return value == null ? null : String(value);
  }

  validateOptions() {
    return aiFieldOptionsSchema.safeParse(this.options);
  }

  validateCellValue(value: unknown) {
    if (this.isMultipleCellValue) {
      return z.array(aiCellValueSchema).nonempty().nullable().safeParse(value);
    }
    return aiCellValueSchema.nullable().safeParse(value);
  }
}
