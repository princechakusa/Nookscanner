// Web rendering of the react-native-svg elements the app uses (same props, plain DOM SVG).
import type { ReactNode } from 'react';

type P = Record<string, unknown> & { children?: ReactNode };
export default function Svg({ children, ...p }: P) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" {...(p as object)}>
      {children}
    </svg>
  );
}
export const Circle = (p: P) => <circle {...(p as object)} />;
export const Path = (p: P) => <path {...(p as object)} />;
export const Rect = (p: P) => <rect {...(p as object)} />;
export const G = ({ children, ...p }: P) => <g {...(p as object)}>{children}</g>;
