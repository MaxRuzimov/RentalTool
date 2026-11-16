/**
 * Contact reveal on an `approved` booking row (spec §3.5/§11, visual uplift
 * per booking-approval-followup-spec.md §B) — a plain presentational
 * component, safe to render from a server component since it has no
 * interactivity of its own.
 */
export default function ContactInfo({
  fullName,
  phone,
}: {
  fullName: string | null;
  phone: string | null;
}) {
  const name = fullName || "the other party";

  return (
    <div className="mt-2 rounded-lg bg-success-bg px-3 py-2">
      <p className="text-sm font-semibold text-success-foreground">You&apos;re approved!</p>
      {phone ? (
        <p className="text-sm text-success-foreground">
          Contact: {name}, {phone}
        </p>
      ) : (
        <p className="text-sm text-success-foreground">
          No phone number on file — contact via {name}&apos;s profile.
        </p>
      )}
      <p className="text-xs text-success-foreground">Arrange pickup and payment directly.</p>
    </div>
  );
}
