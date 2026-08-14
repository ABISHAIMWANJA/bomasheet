import type { IAiFieldOptions } from '@teable/core';
import { FieldType } from '@teable/core';
import { useFields } from '@teable/sdk/hooks';
import { Button, Textarea } from '@teable/ui-lib/shadcn';
import { useMemo } from 'react';

/**
 * Prompt editor for the AI field type.
 *
 * The prompt may reference other fields as {fieldName}; those are substituted
 * with the record's current values when generation runs. sourceFieldIds is
 * kept in sync with whichever fields the prompt actually mentions, so the
 * stored options record the dependency rather than leaving it implicit.
 */
export const AiOptions = (props: {
  options: Partial<IAiFieldOptions> | undefined;
  onChange?: (options: Partial<IAiFieldOptions>) => void;
}) => {
  const { options, onChange } = props;
  const fields = useFields({ withHidden: true });

  const prompt = options?.prompt ?? '';

  // Only offer fields that can meaningfully be interpolated into text, and
  // never the AI field itself -- referencing your own output is a loop.
  const referenceable = useMemo(
    () => fields.filter((field) => field.type !== FieldType.Ai),
    [fields]
  );

  const applyPrompt = (nextPrompt: string) => {
    const mentioned = referenceable
      .filter((field) => nextPrompt.includes(`{${field.name}}`))
      .map((field) => field.id);
    onChange?.({ prompt: nextPrompt, sourceFieldIds: mentioned });
  };

  const insertField = (fieldName: string) => {
    applyPrompt(`${prompt}${prompt && !prompt.endsWith(' ') ? ' ' : ''}{${fieldName}}`);
  };

  return (
    <div className="form-control space-y-2">
      <span className="neutral-content label-text mb-2">Prompt</span>
      <Textarea
        className="h-24 resize-none"
        value={prompt}
        placeholder="Summarize this in one sentence: {Notes}"
        onChange={(e) => applyPrompt(e.target.value)}
      />

      {referenceable.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">
            Insert a field — its value is substituted when you generate
          </span>
          <div className="flex flex-wrap gap-1">
            {referenceable.map((field) => (
              <Button
                key={field.id}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => insertField(field.name)}
              >
                {field.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Values are generated on demand, not automatically on every edit.
      </p>
    </div>
  );
};
