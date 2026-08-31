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
| — | **Release blocker**: "List a tool" (create/edit/delete listing) silently misroutes to log-out instead of saving — found during M12 testing, confirmed pre-existing on `main`, reproducible in a real production build. Must be fixed before real production traffic hits `/listings/new`. | In progress |

## Qoida
Har bir milestone tugagach:
1. `code-reviewer` agent shu branch'ni tekshiradi
2. Review o'tsa — asosiy branch'ga merge qilinadi, status "Done" ga o'zgaradi
3. Manager stakeholder'ga (Max) **faqat** shu milestone uchun sarflangan cost bo'yicha qisqa hisobot beradi
