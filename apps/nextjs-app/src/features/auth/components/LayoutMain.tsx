import { Card } from '@teable/ui-lib/shadcn';
import { AuthFooter } from './AuthFooter';

interface ILayoutMainProps {
  children?: React.ReactNode | React.ReactNode[];
}

export const LayoutMain = (props: ILayoutMainProps) => {
  const { children } = props;
  return (
    <div className="fixed flex h-screen w-full flex-col  justify-center gap-8 overflow-y-auto px-8 py-6 sm:px-6 lg:px-8">
      <Card className="mx-auto flex w-full max-w-md flex-col p-9">{children}</Card>
      <AuthFooter enableClick />
    </div>
  );
};
