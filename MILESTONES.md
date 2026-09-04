# Milestones — Tool Rental Marketplace

Status qiymatlari: Not started / In progress / In review / Done

| # | Milestone | Status |
|---|-----------|--------|
| M1 | Loyiha skeleti: repo, Supabase, CI/CD asosi | Done |
| M2 | Auth: ro'yxatdan o'tish, kirish, profil | Done |
| M3 | Tool listing: e'lon qo'shish/tahrirlash, rasm yuklash | Done |
| M4 | Qidiruv va filtrlash (kategoriya, joylashuv, narx) | Done |
| M5 | Booking flow: ijaraga so'rov, taqvim, status | Done |
| M6 | Reyting va sharh (review) tizimi | Done |
| M7 | Web UI polish — responsive dizayn | Done |
| M8 | Mobil ilova (Expo) — asosiy ekranlar | Done |
| M9 | QA — to'liq test va bug-fix bosqichi | Done |
| M10 | Production deploy — web (Vercel, *.vercel.app) | Done — https://rental-tool-web.vercel.app |
| M11 | App Store / Play Store submission | Not started (deferred — awaiting Max's go-ahead, no store developer accounts exist yet) |
| M12 | Web vizual dizayn tizimi — rang, tipografiya, spacing, komponent uslubi | Done |
| — | ~~Release blocker: "List a tool" appeared to misroute to log-out.~~ **Closed, false alarm** — independently re-confirmed by two separate investigations (backend-engineer and the orchestrating session, on separate fresh production builds). Root cause: the reporting test script used an ambiguous Playwright selector (`button[type="submit"]`) that matched both the header's global "Log out" button and the listing form's own submit button, and silently clicked the wrong one — a test-automation bug, not an app bug. With an unambiguous selector, `createListing`/`updateListing`/`deleteListing` all work correctly (verified: correct Server Action dispatched, listing actually written to the DB, session preserved). No code change was needed; `apps/web/src/app/listings/actions.ts` and `ListingForm.tsx` are unmodified. | Closed (not a bug) |
| — | Post-launch fixes from Max's real usage: (1) signup confirmation link fixed — added `apps/web/src/app/auth/confirm/route.ts` (Supabase's own documented pattern for `@supabase/ssr` SSR apps; the default template's link doesn't establish a cookie session in this app) + a branded template ready for Max to paste (`docs/design/email-templates.md`), still needs Max to update the Supabase Dashboard's Site URL/Redirect URLs and paste the template before it's live end-to-end; (2) a pending-booking-request count badge added to the header's "Bookings" link (in-app half of Max's notification request); (3) the email-to-owner half of that same request is scoped only, not built (`docs/design/booking-request-email-notification.md`) — needs Max to pick/create a transactional email provider account first. | Code merged — awaiting Max's dashboard changes for (1), awaiting provider decision for (3) |
| M13 | Visual craft pass — loading/empty states, micro-interactions, iconography, image placeholders, feedback consistency (on top of M12's tokens + M7's responsiveness, not a redo) | Done |
| M14 | Functionality robustness pass — error-handling audit across server actions, form-validation completeness, double-submit prevention, closing out deferred QA findings (e.g. M6's "Cancel request on an already-completed booking" note) | Done |
| M15 | Availability blocking — surface already-approved-booking dates as blocked/unavailable on the "Request to rent" date picker, instead of only rejecting overlaps server-side after submit | Done |

## Qoida
Har bir milestone tugagach:
1. `code-reviewer` agent shu branch'ni tekshiradi
2. Review o'tsa — asosiy branch'ga merge qilinadi, status "Done" ga o'zgaradi
3. Manager stakeholder'ga (Max) **faqat** shu milestone uchun sarflangan cost bo'yicha qisqa hisobot beradi
