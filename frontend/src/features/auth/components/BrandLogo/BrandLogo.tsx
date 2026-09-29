import { type CSSProperties, type ReactNode, useState } from 'react';
import { cn } from '@/shared/lib';

export interface LogoAsset {
  /** File name inside `frontend/public/logo/`. */
  file: string;
  name: string;
  /**
   * Trims empty margins baked into the image: CSS `inset(top right bottom left)`, as percentages
   * (object-view-box; Chrome/Edge, other browsers show the whole image).
   */
  crop?: string;
}

/**
 * A logo from `frontend/public/logo/`. White image backgrounds are blended away (multiply), so
 * logos on white sit cleanly on the light glass. If the file is missing, `fallback` is shown.
 */
export function BrandLogo({ logo, className, fallback }: { logo: LogoAsset; className?: string; fallback?: ReactNode }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <>{fallback ?? <span className="text-sm font-medium text-slate-800">{logo.name}</span>}</>;
  return (
    <img
      src={`/logo/${logo.file}`}
      alt={logo.name}
      onError={() => setMissing(true)}
      style={logo.crop ? ({ objectViewBox: logo.crop } as CSSProperties) : undefined}
      className={cn('w-auto object-contain mix-blend-multiply', className)}
    />
  );
}
