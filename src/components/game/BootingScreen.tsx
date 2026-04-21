/** Shown while world bootstrap runs so the main thread can paint before heavy init. */
export default function BootingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ink text-center px-8">
      <p className="font-display text-sm tracking-[0.35em] text-gold uppercase">Preparing the realm</p>
      <p className="mt-4 font-mono text-[11px] text-mist/55 max-w-sm leading-relaxed">
        Aligning roads, markets, and coastal markers — this may take a moment on first start.
      </p>
      <div className="mt-8 flex gap-1.5" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-gold/30 animate-pulse" style={{ animationDelay: '0ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-gold/30 animate-pulse" style={{ animationDelay: '150ms' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-gold/30 animate-pulse" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}
