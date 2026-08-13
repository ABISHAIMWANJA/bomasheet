import * as React from 'react';
import type { SVGProps } from 'react';
const BomaSheet = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect
      width={20.4}
      height={20.4}
      x={1.8}
      y={1.8}
      stroke="currentColor"
      strokeWidth={1.8}
      rx={5.2}
    />
    <rect width={11} height={2.4} x={6.5} y={7.3} fill="currentColor" rx={1.2} />
    <g fill="currentColor" opacity={0.55}>
      <rect width={5} height={2.4} x={6.5} y={11.1} rx={1.2} />
      <rect width={5} height={2.4} x={12.5} y={11.1} rx={1.2} />
      <rect width={5} height={2.4} x={6.5} y={14.9} rx={1.2} />
      <rect width={5} height={2.4} x={12.5} y={14.9} rx={1.2} />
    </g>
  </svg>
);
export default BomaSheet;
