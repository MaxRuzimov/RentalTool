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
| M10 | Production deploy — web (Vercel, *.vercel.app) | In progress |
| M11 | App Store / Play Store submission | Not started (deferred — awaiting Max's go-ahead, no store developer accounts exist yet) |
| — | **Release blocker (not reproducible)**: originally reported as "List a tool" (create/edit/delete listing) silently misrouting to log-out instead of saving. Investigated on `fix/create-listing-wrong-action`: extensive testing (real local Supabase, real browser via Playwright, fresh production builds — `next build && next start` with the default Turbopack compiler, 3+ independent rebuilds, minimal isolated repro pages) found **no genuine bug** in `createListing`/`updateListing`/`deleteListing`. (`--webpack` was not independently retested during this investigation — the original report claimed it was also affected, but given the root cause found below, that claim should be treated with the same skepticism.) The original "misrouting to `logout`" observation was traced to a test-automation artifact: the page has two `<button type="submit">` elements (the header's global "Log out" button, rendered first in the DOM via the root layout, and the form's own submit button); an ambiguous CSS selector (`button[type="submit"]`) combined with Playwright's legacy `.click()` (which silently acts on the first DOM match instead of throwing a strict-mode error on ambiguity) clicked "Log out" instead of the listing form's button — explaining the wrong Server Action id, the cleared session, and the redirect to `/`, with zero relation to real user behavior (the two buttons are visually far apart; a real user cannot misclick between them). With an unambiguous selector (`getByRole("button", { name: ... })`), create/update/delete all captured the correct action id, wrote to the DB correctly, and preserved the session, across 3+ independent fresh production builds. No code change made — `apps/web/src/app/listings/actions.ts` and `apps/web/src/components/listings/ListingForm.tsx` are unmodified from `main`. Recommend closing this item; if "List a tool" is still seen failing in a real browser, re-report with exact repro steps (not an automated script) so this doesn't recur. | Not reproducible — recommend closing |

## Qoida
Har bir milestone tugagach:
1. `code-reviewer` agent shu branch'ni tekshiradi
2. Review o'tsa — asosiy branch'ga merge qilinadi, status "Done" ga o'zgaradi
3. Manager stakeholder'ga (Max) **faqat** shu milestone uchun sarflangan cost bo'yicha qisqa hisobot beradi
