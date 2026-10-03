import { ButtonLink } from "./Button";

// Placeholder for screens built in a later phase.
export function ComingNext({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="text-center">
        <h1 className="text-[22px] font-light">{title}</h1>
        <p className="mt-2 text-muted">{phase}</p>
        <ButtonLink href="/payments" variant="secondary" className="mt-6">
          Back to Payments
        </ButtonLink>
      </div>
    </div>
  );
}
