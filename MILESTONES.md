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
| M12 | Web vizual dizayn tizimi — rang, tipografiya, spacing, komponent uslubi | Done |
| — | ~~Release blocker: "List a tool" appeared to misroute to log-out.~~ **Closed, false alarm** — independently re-confirmed by two separate investigations (backend-engineer and the orchestrating session, on separate fresh production builds). Root cause: the reporting test script used an ambiguous Playwright selector (`button[type="submit"]`) that matched both the header's global "Log out" button and the listing form's own submit button, and silently clicked the wrong one — a test-automation bug, not an app bug. With an unambiguous selector, `createListing`/`updateListing`/`deleteListing` all work correctly (verified: correct Server Action dispatched, listing actually written to the DB, session preserved). No code change was needed; `apps/web/src/app/listings/actions.ts` and `ListingForm.tsx` are unmodified. | Closed (not a bug) |

## Qoida
Har bir milestone tugagach:
1. `code-reviewer` agent shu branch'ni tekshiradi
2. Review o'tsa — asosiy branch'ga merge qilinadi, status "Done" ga o'zgaradi
3. Manager stakeholder'ga (Max) **faqat** shu milestone uchun sarflangan cost bo'yicha qisqa hisobot beradi
