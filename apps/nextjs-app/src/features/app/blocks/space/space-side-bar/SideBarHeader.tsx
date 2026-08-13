import { BomaSheet, Sidebar } from '@teable/icons';
import { Button, TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@teable/ui-lib';
import { BRAND_NAME } from '@/lib/brand';
import type { ISideBarInteractionProps } from '../../../blocks/base/base-side-bar/SideBar';

export const SideBarHeader = (prop: ISideBarInteractionProps) => {
  const { expandSideBar } = prop;

  return (
    <div className="m-2 flex items-center gap-1">
      <BomaSheet className="size-6 shrink-0 text-primary" />
      <p className="truncate text-sm">{BRAND_NAME}</p>
      <div className="grow basis-0"></div>
      {expandSideBar && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="w-6 shrink-0 px-0"
                variant="ghost"
                size="xs"
                onClick={() => expandSideBar?.()}
              >
                <Sidebar className="size-4"></Sidebar>
              </Button>
            </TooltipTrigger>
            <TooltipContent hideWhenDetached={true}>
              <p>Collapse SideBar ⌘+B</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};
