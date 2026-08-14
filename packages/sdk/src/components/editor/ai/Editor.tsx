import { Button, Textarea, cn } from '@teable/ui-lib';
import { useState } from 'react';

interface IAiEditorProps {
  tableId?: string;
  recordId?: string;
  fieldId: string;
  value?: string | null;
  onChange?: (value: string | null) => void;
  readonly?: boolean;
  className?: string;
}

/**
 * Cell editor for the AI field.
 *
 * The value is ordinary text and stays editable by hand -- generation just
 * fills it in. Generating is explicit rather than automatic: there is no job
 * queue in this codebase, so the request runs inline and the caller waits on
 * a live model call.
 */
export const AiEditor = (props: IAiEditorProps) => {
  const { tableId, recordId, fieldId, value, onChange, readonly, className } = props;
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>();

  // Generation writes to a record server-side, so it needs one that exists.
  const canGenerate = Boolean(tableId && recordId) && !readonly;

  const generate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setError(undefined);
    try {
      const res = await fetch(
        `/api/table/${encodeURIComponent(tableId as string)}/record/${encodeURIComponent(
          recordId as string
        )}/field/${encodeURIComponent(fieldId)}/ai-generate`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { value?: string };
      if (typeof data.value === 'string') {
        onChange?.(data.value);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <Textarea
        className="h-24 resize-none"
        value={value ?? ''}
        readOnly={readonly}
        placeholder={readonly ? '' : 'Generate, or type a value directly'}
        onChange={(e) => onChange?.(e.target.value || null)}
      />
      {!readonly && (
        <div className="flex items-center gap-2">
          <Button size="xs" variant="outline" disabled={!canGenerate || generating} onClick={generate}>
            {generating ? 'Generating…' : 'Generate'}
          </Button>
          {!recordId && (
            <span className="text-xs text-muted-foreground">Save the record first</span>
          )}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};
