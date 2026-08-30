/**
 * Contact reveal on an `approved` booking row (spec §3.5/§11) — a plain
 * presentational component, safe to render from a server component since it
 * has no interactivity of its own.
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
    <div className="mt-2">
      {phone ? (
        <p className="text-sm text-foreground">
          Contact: {name}, {phone}
        </p>
      ) : (
        <p className="text-sm text-foreground">
          No phone number on file — contact via {name}&apos;s profile.
        </p>
      )}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Arrange pickup and payment directly.</p>
    </div>
  );
}
