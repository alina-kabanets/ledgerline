import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-8 text-center">
      <div>
        <h1 className="text-[22px] font-light">This page does not exist</h1>
        <ButtonLink href="/payments" variant="secondary" className="mt-5">
          Back to Payments
        </ButtonLink>
      </div>
    </div>
  );
}
