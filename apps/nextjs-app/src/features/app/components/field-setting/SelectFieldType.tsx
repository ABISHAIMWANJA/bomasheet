import { FieldType } from '@teable/core';
import { BetaFeature, FIELD_TYPE_ORDER, useBetaFeature, useFieldStaticGetter } from '@teable/sdk';
import { Selector } from '@teable/ui-lib/base';
import SearchIcon from '@teable/ui-lib/icons/app/search.svg';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';
import { tableConfig } from '@/features/i18n/table.config';

export const SelectFieldType = (props: {
  value?: FieldType | 'lookup';
  onChange?: (type: FieldType | 'lookup') => void;
}) => {
  const { value = FieldType.SingleLineText, onChange } = props;
  const getFieldStatic = useFieldStaticGetter();
  const { t } = useTranslation(tableConfig.i18nNamespaces);
  // Gated field types stay hidden until the server says this user may see
  // them -- see BETA_FEATURES / INSTANCE_ADMIN_EMAILS in the backend config.
  const canUseAiField = useBetaFeature(BetaFeature.AiField);

  const candidates = useMemo(
    () =>
      FIELD_TYPE_ORDER.filter(
        (type) => type !== FieldType.Ai || canUseAiField
      ).map<{ id: FieldType | 'lookup'; name: string; icon: JSX.Element }>(
        (type) => {
          const { title, Icon } = getFieldStatic(type, false);
          return {
            id: type,
            name: title,
            icon: <Icon />,
          };
        }
      ).concat({
        id: 'lookup',
        name: t('sdk:field.title.lookup'),
        icon: <SearchIcon className="size-4" />,
      }),
    [getFieldStatic, t, canUseAiField]
  );

  return (
    <Selector
      contentClassName="select-field-type"
      candidates={candidates}
      selectedId={value}
      onChange={(id) => onChange?.(id as FieldType | 'lookup')}
    />
  );
};
