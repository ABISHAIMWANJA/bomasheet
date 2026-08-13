import { BomaSheet } from '@teable/icons';
import { Separator } from '@teable/ui-lib/shadcn';
import { useTranslation } from 'next-i18next';
import { SOURCE_CODE_URL } from '@/lib/brand';

interface ISettingSidebarProps {
  children: React.ReactNode;
}
export const SettingSidebar = (props: ISettingSidebarProps) => {
  const { children } = props;
  const { t } = useTranslation('common');
  return (
    <div className="mr-10 flex min-w-52 flex-col">
      <div className="flex h-20 items-center">
        <BomaSheet className="text-3xl text-primary" />
        <h1 className="ml-2 text-2xl font-semibold">{t('settings.title')}</h1>
      </div>
      <Separator />
      <div className="mt-4 grow">{children}</div>
      {/* AGPL-3.0 section 13: hosted users must be able to reach this instance's source. */}
      <a
        href={SOURCE_CODE_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-4 py-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        {t('settings.sourceCode')}
      </a>
    </div>
  );
};
