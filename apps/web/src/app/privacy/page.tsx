import type { Metadata } from "next";

// This page is written to accurately describe this specific codebase as of
// M15 (fact-checked against apps/web/package.json + apps/mobile/package.json
// deps, and the auth/schema code): no OAuth providers, no device
// camera/location permissions, no analytics/crash-reporting SDKs anywhere in
// the app, listing photos live in a private Supabase Storage bucket served
// via signed URLs, and phone-number visibility is gated by the M5
// booking_contact() SECURITY DEFINER mechanism. If any of that changes in a
// future milestone (e.g. an analytics SDK gets added, OAuth login gets
// added, a native camera/photo-library flow gets added to mobile), this page
// needs a matching update — don't let it silently drift out of accuracy.

// Placeholder support inbox — max.ruzimov@gmail.com is the stakeholder's real
// address, functional for now, flagged to him separately to swap for a
// dedicated support address later. Swap this one constant when that's ready.
const CONTACT_EMAIL = "max.ruzimov@gmail.com";

export const metadata: Metadata = {
  title: "Privacy Policy — RentalTool",
  description: "How RentalTool collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        RentalTool Privacy Policy
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Effective date: September 20, 2026
      </p>

      <p className="mt-6 text-sm leading-relaxed text-foreground">
        RentalTool (&ldquo;RentalTool,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) operates a
        peer-to-peer tool rental marketplace serving the Greater Toronto Area, available on the
        web at rental-tool-web.vercel.app and as a mobile app. This policy explains what personal
        information we collect, how we use it, and the choices you have.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-foreground">1. Information we collect</h2>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        <strong className="font-semibold">Account information.</strong> When you create an
        account, we collect your email address and password. Your password is handled by our
        authentication provider, Supabase, and is never stored by us in plain text.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        <strong className="font-semibold">Profile information you choose to provide.</strong>{" "}
        Full name, phone number, city, and an avatar image link. All of these are optional and
        editable at any time from your profile page. Your phone number is private by default —
        we only reveal it to the other party in a booking once you (as the tool owner) have
        approved that specific booking request, so you can coordinate pickup. It is never shown
        publicly on a listing or to other users.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        <strong className="font-semibold">Listing information, if you list a tool.</strong>{" "}
        Title, description, category, price, a general location description (e.g. a
        neighbourhood or city — we do not collect your device&rsquo;s precise GPS location), and
        photos you upload of the tool.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        <strong className="font-semibold">Booking and review information.</strong> Requested
        rental dates, booking status (pending, approved, declined, or cancelled), and any star
        rating or written review you leave after a completed rental.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        <strong className="font-semibold">What we do not collect.</strong> We do not access your
        device&rsquo;s camera, photo library, or precise location through the app itself — photo
        uploads happen through a standard web file picker when you create a listing, and location
        is a free-text field you type in yourself. We do not use advertising trackers, and we do
        not use any third-party analytics or crash-reporting service at this time.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-foreground">
        2. How we use your information
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        We use the information above to operate the marketplace: to show your listings to
        prospective renters, to process booking requests and connect approved renters and owners,
        to display reviews, and to let you manage your own account and listings. We do not use
        your information for advertising, and we do not build advertising profiles from it.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-foreground">3. Who we share it with</h2>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        We do not sell your personal information, and we do not share it with third parties for
        their own marketing purposes.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        We do share information with the service providers that make RentalTool possible, only as
        needed to run the product:
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
        <li>
          <strong className="font-semibold">Supabase</strong>, our database, authentication, and
          file storage provider, which stores and processes the information described above on
          our behalf.
        </li>
        <li>
          <strong className="font-semibold">Vercel</strong>, which hosts the RentalTool website.
        </li>
        <li>
          The relevant <strong className="font-semibold">app store</strong> (Google Play, and
          Apple&rsquo;s App Store if we later offer this app there), which handles distribution of
          the mobile app and may collect its own standard installation/device data under its own
          privacy policy — that collection is theirs, not RentalTool&rsquo;s.
        </li>
      </ul>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        Photos and listing details you publish are, by design, visible to other people using
        RentalTool, since that&rsquo;s how a rental marketplace works — that&rsquo;s different
        from us sharing your data with outside companies.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-foreground">
        4. Your choices and rights
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        You can view and update most of your information at any time from your profile page. To
        request a copy of your data, or to request that your account and associated personal
        information be deleted, contact us at{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-medium text-accent underline-offset-2 hover:underline hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
        >
          {CONTACT_EMAIL}
        </a>
        . We&rsquo;ll act on deletion requests within a reasonable time, except where we need to
        keep limited records (e.g. to resolve an open booking dispute or as required by law).
      </p>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        If you&rsquo;re a Canadian resident, you have rights under Canada&rsquo;s federal privacy
        law (PIPEDA) regarding your personal information, including the right to access
        information we hold about you — the request process above is how to exercise that.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-foreground">5. Data retention</h2>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        We keep your information for as long as your account is active, plus a reasonable period
        afterward in case it&rsquo;s needed to resolve a dispute about a past booking or as
        required by law. If you delete your account, we remove or anonymize your personal
        information other than what we&rsquo;re required to retain.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-foreground">6. Security</h2>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        We rely on Supabase&rsquo;s infrastructure, which applies industry-standard practices
        such as encryption of data in transit and at rest. No system is completely secure, but we
        take reasonable steps to protect your information.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-foreground">7. Children&rsquo;s privacy</h2>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        RentalTool is not directed at children, and we do not knowingly collect personal
        information from anyone under 13. If you believe a child has provided us with personal
        information, contact us and we&rsquo;ll remove it.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-foreground">8. Changes to this policy</h2>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        If we make material changes to this policy, we&rsquo;ll update the effective date above
        and post the revised policy at this same address.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-foreground">9. Contact us</h2>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        Questions about this policy, or a request about your data? Email us at{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-medium text-accent underline-offset-2 hover:underline hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
        >
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </div>
  );
}
