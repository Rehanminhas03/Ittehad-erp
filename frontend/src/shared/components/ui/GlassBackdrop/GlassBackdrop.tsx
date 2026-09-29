import { cn } from '@/shared/lib';

/**
 * The backdrop the glass surfaces float over: a soft slate-blue with deeper pools of light (glass
 * needs colour behind it to read). `fixed` pins it to the viewport so it stays put while a page scrolls.
 */
export function GlassBackdrop({ fixed = false }: { fixed?: boolean }) {
  return (
    <div aria-hidden className={cn('pointer-events-none inset-0 -z-10 overflow-hidden', fixed ? 'fixed' : 'absolute')}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#d9e1ee] via-[#cdd7e7] to-[#b9c6dc]" />
      <div className="absolute -top-40 -left-32 size-[38rem] rounded-full bg-[#4f7fe0]/40 blur-3xl" />
      <div className="absolute top-1/3 left-1/3 size-[26rem] rounded-full bg-[#f2b58c]/25 blur-3xl" />
      <div className="absolute top-0 -right-32 size-[34rem] rounded-full bg-[#3b64c4]/35 blur-3xl" />
      <div className="absolute right-1/4 -bottom-48 size-[36rem] rounded-full bg-[#6b7fd8]/40 blur-3xl" />
      <div className="absolute bottom-0 -left-24 size-[24rem] rounded-full bg-[#8fb4f0]/40 blur-3xl" />
      {/* Soft vignette: slightly deeper at the edges, keeping the centre calm. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(30,41,82,0.14)_100%)]" />
    </div>
  );
}
