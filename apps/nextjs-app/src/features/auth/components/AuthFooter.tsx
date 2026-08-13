import { BomaSheet } from '@teable/icons';
import { cn } from '@teable/ui-lib/shadcn';
import { useTranslation } from 'next-i18next';
import { authConfig } from '@/features/i18n/auth.config';

interface IAuthFooterProps {
  className?: string;
  enableClick?: boolean;
}

export const AuthFooter = (props: IAuthFooterProps) => {
  const { className, enableClick } = props;
  const { t } = useTranslation(authConfig.i18nNamespaces);

  return (
    <div
      data-state={enableClick ? 'click' : undefined}
      className={cn(
        'max-w-6xl mx-auto w-full flex items-center justify-center gap-2 data-[state=click]:cursor-pointer font-bold',
        className
      )}
    >
      <BomaSheet className="size-8 text-primary" />
      {t('common:brand')}
    </div>
  );
};
