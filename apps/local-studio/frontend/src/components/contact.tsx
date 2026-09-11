import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name."),
  email: z.string().trim().email("A valid email, please."),
  kind: z.string().min(1, "Choose a type of work."),
  message: z.string().trim().min(12, "A little more context helps."),
});

type FieldErrors = Partial<Record<keyof z.infer<typeof schema>, string>>;
const KINDS = ["Brand identity", "Product / digital", "AgentSam platform", "Something else"] as const;

export function Contact() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = {
      name: String(new FormData(form).get("name") ?? ""),
      email: String(new FormData(form).get("email") ?? ""),
      kind: String(new FormData(form).get("kind") ?? ""),
      message: String(new FormData(form).get("message") ?? ""),
    };
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !next[key as keyof FieldErrors]) next[key as keyof FieldErrors] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 650));
    setSubmitting(false);
    setSent(true);
  }

  return (
    <section id="contact" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <div className="grid gap-12 border-t border-border pt-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-clay uppercase">Contact</p>
          <h2 className="mt-2 font-display text-4xl tracking-tight text-bone sm:text-5xl">Get in touch</h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-clay">Briefs, introductions, and collaborations. We read every message and reply within a few days.</p>
        </div>
        {sent ? (
          <div className="flex min-h-72 flex-col justify-center rounded-2xl bg-surface px-8 py-10" role="status" aria-live="polite">
            <p className="font-display text-3xl tracking-tight text-bone">Received.</p>
            <p className="mt-3 max-w-sm text-base leading-relaxed text-clay">Thank you. We'll write back within a few days.</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="rounded-2xl bg-surface p-5 sm:p-8" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="mb-1.5 block text-xs tracking-[0.12em] text-clay uppercase">Name</label>
                <Input id="name" name="name" autoComplete="name" required aria-invalid={!!errors.name} />
                {errors.name ? <p className="mt-1.5 text-xs text-stone">{errors.name}</p> : null}
              </div>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs tracking-[0.12em] text-clay uppercase">Email</label>
                <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!errors.email} />
                {errors.email ? <p className="mt-1.5 text-xs text-stone">{errors.email}</p> : null}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="kind" className="mb-1.5 block text-xs tracking-[0.12em] text-clay uppercase">Type of work</label>
                <select id="kind" name="kind" defaultValue="" suppressHydrationWarning className="h-11 w-full rounded-md border border-border bg-bg px-3.5 font-sans text-base text-fg outline-none focus:border-stone/40 focus:ring-2 focus:ring-stone/20 md:text-sm" aria-invalid={!!errors.kind}>
                  <option value="" disabled>Choose one</option>
                  {KINDS.map((kind) => (<option key={kind} value={kind}>{kind}</option>))}
                </select>
                {errors.kind ? <p className="mt-1.5 text-xs text-stone">{errors.kind}</p> : null}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="message" className="mb-1.5 block text-xs tracking-[0.12em] text-clay uppercase">Message</label>
                <Textarea id="message" name="message" rows={5} placeholder="What are we making, and when?" required aria-invalid={!!errors.message} className="min-h-32 rounded-md border border-border bg-bg px-3.5 py-3" />
                {errors.message ? <p className="mt-1.5 text-xs text-stone">{errors.message}</p> : null}
              </div>
            </div>
            <div className="mt-6">
              <Button type="submit" size="lg" disabled={submitting}>{submitting ? "Sending…" : "Send note"}</Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
