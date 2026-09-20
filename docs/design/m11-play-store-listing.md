# M11 — Google Play Store Listing Content (draft, ready for Max to paste into Play Console)

Status: content drafted, ready to use once the Play Console account exists. Everything below is copy/answers to paste in — nothing here requires code changes on its own (the one thing that does, the privacy policy page, is tracked separately as its own branch/PR, see MILESTONES.md M11).

Scope note: this covers Google Play only, per Max's decision to defer Apple App Store submission. Nothing here is Apple-specific.

## 1. Store listing copy

**App name** (Play Store max 30 characters): `RentalTool`

**Short description** (max 80 characters — currently 71):
> Rent tools from people near you in the GTA, or list your own to earn.

**Full description** (max 4,000 characters):

```
Need a tool for a weekend project but don't want to buy one you'll only use once? RentalTool connects tool owners and renters across the Greater Toronto Area, so you can borrow exactly what you need — and if you have tools sitting in your garage, list them and earn a little extra.

HOW IT WORKS
• Browse tools near you — power tools, hand tools, ladders, lawn & garden equipment, generators, and more, all in one place.
• Filter by category, location, and price to find what you need fast.
• Send a request to rent for the dates you need. The owner reviews and approves your request.
• Once approved, you get the owner's contact info to arrange pickup, drop-off, and payment directly — simple and flexible.
• Leave a review after your rental to help other renters.

FOR TOOL OWNERS
List anything you own that others might need — a pressure washer, a ladder, a generator, power tools, and more. You control your price, your availability, and who you approve. Your phone number is only shared with a renter once you've approved their specific request.

WHY RENTALTOOL
• Built for the GTA community — borrow locally instead of buying tools you'll rarely use.
• Simple request-and-approve flow, no complicated booking system.
• Ratings and reviews help you rent with confidence.
• Your contact info stays private until you approve a request.

RentalTool is in its early stages, focused on making it easy to find and request tools nearby. Have feedback? We'd love to hear it.
```

**Category**: Play Console will ask for a primary category — recommend "Lifestyle" or "House & Home" (no dedicated "marketplace/rental" category exists as of this writing; either is a defensible fit, Max's call, low-stakes and changeable later).

**Feature graphic (1024x500 px, required)** and **screenshots**: not produced in this pass — see §4 below for what's blocking these and the plan to close that gap.

## 2. Data safety section — draft answers

Google Play's Data Safety form asks structured questions about what your app collects/shares. Answers below are derived directly from this codebase's actual schema and dependencies (`supabase/migrations/*.sql`, `apps/web/package.json`, `apps/mobile/package.json` — verified no analytics/crash-reporting/ad SDK is present in either app as of M15).

**Does your app collect or share any of the required user data types?** Yes.

| Data type | Collected? | Shared with third parties? | Purpose | Optional for the user? |
|---|---|---|---|---|
| Email address | Yes | No | Account creation / app functionality | No (required for signup) |
| Name | Yes | No — shown to other users as part of normal app functionality (a listing owner's/reviewer's display name), not shared with outside companies | App functionality | Yes |
| Phone number | Yes | No — shared only with the other party of a specific **approved** booking, entirely within the app's own booking-approval logic, never with an outside company | App functionality | Yes |
| Photos | Yes (listing photos, uploaded via the web app only) | No | App functionality (published as part of a listing, which is the point of the app) | Yes (only if the user creates a listing) |
| User-generated content (listing descriptions, reviews) | Yes | No | App functionality | Yes / Yes |
| Precise or approximate location (device-derived, e.g. GPS) | **No** — not collected. The app has no location permission and no device-location API call anywhere in its code. | N/A | N/A | N/A |
| App activity / analytics | No | No | N/A — no analytics or crash-reporting SDK is integrated in either the web or mobile app as of this writing | N/A |
| Financial / payment info | No | No | N/A — this app has no payment/checkout feature (see `PROJECT_BRIEF.md`: online payment is explicitly out of MVP scope, users arrange payment directly) | N/A |
| Messages / in-app chat | No | No | N/A — no messaging feature exists; contact happens via the phone number exchange described above | N/A |

**Important distinction to get right in the actual form**: Play's "Location" data-safety category specifically means device-derived location (GPS/network/Wi-Fi positioning) collected via a location permission — this app has none of that. The free-text "location" field a user types when creating a listing (e.g. "Etobicoke" or "North York") is ordinary user-generated app content, not the "Location" data type Play's form is asking about. Answer "Location: not collected" and don't conflate it with the free-text field.

**Is all user data encrypted in transit?** Yes — HTTPS/TLS throughout (Vercel for the web app, Supabase for the API/database, standard for both).

**Can users request their data be deleted?** Yes — via the contact email in the new privacy policy page (`/privacy`, see MILESTONES.md M11 for its implementation status). There is no in-app self-service "delete my account" button today; Play accepts a documented request-based deletion process (not necessarily automated in-app), which is what this is. If Max wants a fully automated in-app deletion flow later, that's a real, separate, small future milestone — flagged here, not built.

## 3. Content rating questionnaire — guidance, not a final rating

Google Play generates the actual content rating (via IARC) from a questionnaire filled out in Play Console — the answers below are what this app's actual feature set implies, so Max can fill the real form quickly, but the final rating label is assigned by IARC's system, not chosen directly.

- Violence: None.
- Sexual content: None.
- Profanity: None built into the app; user-generated text (listing descriptions, reviews) is technically unmoderated free text, so answer honestly that the app allows user-generated text content without pre-moderation (this is accurate — there's no profanity filter or review-moderation step in this codebase) — this typically nudges toward a "may contain user-generated content" flag/teen-range rating rather than an all-ages rating with no caveats, which is expected and fine for a marketplace app with free-text listings/reviews.
- Controlled substances / gambling: None.
- User interaction / sharing personal info: Yes — the app lets users exchange phone numbers (gated to approved bookings only, per §2) and see each other's names/reviews. Answer the "does your app allow users to share personal information with other users" question honestly as Yes, scoped to that specific, narrow mechanism.
- Digital purchases: None (no in-app purchases or payment feature).

## 4. What's still blocked and why (screenshots / feature graphic)

Producing real Play-Store-quality screenshots and a 1024x500 feature graphic needs either a running Android emulator/device or real design-tool output — see the mobile-engineer's M11 prep report (branch `feature/m11-play-store-prep`) for exactly what was/wasn't achievable in this environment. Whatever that report says should be treated as the up-to-date status; this doc doesn't duplicate it since it can go stale. If a genuine device/emulator screenshot isn't available from this environment, that's expected — flagged for Max to capture from his own device/an Android Studio emulator once he has the app running, or the mobile-engineer's best-effort web-rendered drafts (if produced) can serve as a placeholder for review purposes only.

## 5. Sources for the Data Safety / content rating answers above

These answers were derived from reading this repo's actual code, not from external research:
- `supabase/migrations/00000000000001_init_profiles.sql` (profiles schema: email via `auth.users`, `full_name`, `avatar_url`, `phone`, `city`)
- `supabase/migrations/00000000000002_listings.sql`, `00000000000003_listing_images_bucket.sql` (listings + private photo storage)
- `apps/web/package.json`, `apps/mobile/package.json` (dependency audit — no analytics/ad/crash SDK present)
- `docs/design/m5-booking-spec.md` §3.5 and `supabase/migrations/00000000000004_bookings.sql`'s `booking_contact()` function (phone-number visibility mechanism)
- `docs/design/m8-mobile-spec.md` §4.1 (confirms mobile has no camera/photo-upload/device-location feature at all)
- `PROJECT_BRIEF.md` (no online payment in MVP scope)
