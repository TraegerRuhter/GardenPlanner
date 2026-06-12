/**
 * Placeholder screen for tabs whose module has not landed yet. Each stub
 * names its spec section and build phase so the shell is honest about what
 * exists. Replaced module-by-module as phases complete.
 */

interface StubPageProps {
  title: string;
  purpose: string;
  specRef: string;
  phase: number;
}

export function StubPage({ title, purpose, specRef, phase }: StubPageProps) {
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-3 px-6 py-10">
      <h1 className="text-2xl font-bold text-[var(--color-ink)]">{title}</h1>
      <p className="text-[var(--color-ink-soft)]">{purpose}</p>
      <p className="text-sm text-[var(--color-ink-soft)]">
        Spec {specRef} · arrives in Phase {phase}
      </p>
    </section>
  );
}
