import { BomaSheet } from '@teable/icons';
import type { FC } from 'react';
import { BRAND_NAME } from '@/lib/brand';

export const Error: FC<{ message: string }> = (props) => {
  const { message } = props;
  return (
    <div className="mer flex h-screen flex-col items-center justify-center">
      <div>
        <div className="flex w-full">
          <BomaSheet className="text-4xl text-primary" />
          <p className="ml-1 truncate text-4xl font-semibold">{BRAND_NAME}</p>
        </div>
        <h1 className="scroll-m-20 text-3xl tracking-tight">{message}</h1>
      </div>
    </div>
  );
};
