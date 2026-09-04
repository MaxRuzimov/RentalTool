# Payments Integration — Planning Document (Post-MVP)

Status: **planning only — nothing in this document is implemented.** No Stripe account exists, no payment code has been written, no money movement occurs anywhere in the product today.
Scope of this document: business/regulatory context, a recommended technical approach, and an honest cost estimate, so Max can decide *if and when* to greenlight actual payments work. This document does not gate or block anything currently in progress.

Per `PROJECT_BRIEF.md`: "Onlayn to'lov MVP'da YO'Q — foydalanuvchilar faqat e'lon ko'radi va bog'lanadi (chat yoki telefon orqali), to'lovni o'zaro kelishadi. To'lov integratsiyasi keyingi bosqichda qo'shiladi" (no online payment in the MVP — users browse listings and connect via chat or phone, and arrange payment between themselves; payment integration is added in a later phase). This document is that later-phase plan, written now so it's ready when Max decides to act on it.

## 1. Recommended approach: Stripe Connect

**Recommendation: Stripe Connect, specifically the Express account type, using destination charges.** This is the standard architecture for two-sided marketplaces (Stripe's own account-type guidance names Airbnb-style home-rental marketplaces as the textbook Express use case — this app is architecturally the same shape: an owner lists an asset, a renter pays for time-boxed use of it, the platform takes a cut). [Source: docs.stripe.com/connect/accounts](https://docs.stripe.com/connect/accounts)

### Why Connect over simpler alternatives

| Approach | What it is | Why not recommended here |
|---|---|---|
| Plain Stripe Checkout/Payment Intents (no Connect) | RentalTool has one Stripe account; all money lands in it | RentalTool would legally be the merchant of record for every transaction and would owe every tool owner their share manually (bank transfers, e-transfers, etc.) — this is a real operational and compliance burden the moment there's more than a handful of owners, and it makes RentalTool, not Stripe, responsible for tracking who's owed what |
| Stripe Connect — **Standard** accounts | Each owner gets a real Stripe account with a direct Stripe relationship; owner is merchant of record | Least platform liability, but owners handle their own disputes/refunds and need real comfort operating a Stripe account — too much friction for casual P2P tool owners renting out a drill twice a month |
| Stripe Connect — **Express** accounts (recommended) | Stripe hosts onboarding/identity verification; platform controls charge type and payout timing; platform (not the owner) is on the hook for disputes by default | Middle ground: low integration effort, fast owner onboarding (a hosted Stripe flow, not custom-built), and it matches what Airbnb/Lyft-style marketplaces use per Stripe's own docs |
| Stripe Connect — **Custom** accounts | Fully white-labeled, connected account is invisible to the account holder | Significantly higher integration effort and RentalTool becomes responsible for all compliance/identity-verification communication Stripe would otherwise handle automatically — not worth it pre-revenue |

Source for the comparison table above: [Stripe — Connected account types](https://docs.stripe.com/connect/accounts) (Standard vs. Express vs. Custom, official comparison table).

### Why Express specifically, and what "destination charges" means here

With Express + destination charges: the renter pays RentalTool's Stripe account, Stripe automatically splits the payment (owner's share to the owner's connected Express account, RentalTool's commission stays), and **the platform — not the individual tool owner — is the party on the hook for handling a dispute/chargeback by default.** This matters for RentalTool specifically: casual individual tool owners are not going to competently fight a Stripe dispute, so leaving dispute liability with the platform (Express/Custom) rather than the connected account (Standard) is the safer default for a P2P marketplace of non-professional sellers. [Source: docs.stripe.com/connect/accounts, "Fraud and dispute liability" row]

## 2. Regulatory question: does RentalTool become a money transmitter?

**Short answer: no, not if built on Stripe Connect as described above** — this is the core regulatory reason Connect exists as a product, not a guess.

Stripe's own documentation states platforms using Connect "benefit from Stripe's money transmitter licenses and e-money authorizations around the world instead of having to get their own licenses in every region" they operate in. [Source: Stripe — What is a money transmitter?](https://stripe.com/resources/more/what-is-a-money-transmitter) Stripe itself holds money transmitter licenses (MTLs) in the relevant US states and, for Europe, operates through an authorized e-money institution subsidiary; a platform routing funds through Connect rides on top of that licensing rather than needing its own. [Source: same page]

**This is not unconditional, though**, and the exact structure matters:
- It holds as long as RentalTool never takes custody of renter funds outside Stripe's rails (i.e., no "collect cash/e-transfer and manually pay out owners later" side-channel — the moment RentalTool itself holds and redistributes third-party funds outside Stripe's system, the money-transmitter analysis changes).
- The framing above cites Stripe's US money-transmitter-license / EU e-money-institution licensing, but RentalTool is Canada-only — the equivalent Canadian angle is FINTRAC's Money Services Business (MSB) regime, not a provincial/state MTL. The same underlying logic (Connect routes funds through Stripe's own regulated rails rather than RentalTool taking custody) should apply, but this is exactly the kind of jurisdiction-specific detail the lawyer consult below should confirm rather than this document asserting it.
- The commission/fee RentalTool keeps is a normal marketplace service fee, not "money transmission" — this is exactly the split Connect's charge-splitting mechanics are built to formalize (Stripe takes the full charge, routes the owner's share out via `transfer_data`, keeps the remainder).
- This is Stripe's own characterization of its product, not independent legal advice. **Before processing a single real dollar, Max should get a short, paid consult with a Canadian fintech/payments lawyer to confirm this holds for RentalTool's specific structure** — cheap relative to the risk, and the honest scope estimate in §5 assumes this as a real line item, not a formality to skip.

## 3. Business decisions Max needs to make before this can be built

None of these are engineering decisions — they're called out here because implementation can't start without answers, and getting them wrong after the fact means a schema/UX rework, not a config change.

1. **Commission percentage.** What cut does RentalTool take per booking? (Common P2P marketplace ranges are roughly 10-20% total, often split as a renter-side service fee + an owner-side commission — e.g. Airbnb's model — vs. a single flat owner-side cut. Either is workable with Connect's `application_fee_amount`; this is a pure business call, not a technical constraint.)
2. **Who's liable for tool damage/loss during a rental?** Is there a security deposit? A damage-protection fee bundled into the price? Or is damage handled entirely peer-to-peer (matches the MVP's existing "arrange it yourselves" philosophy, just extended to damage instead of price)? This drives real schema (a deposit needs its own hold/capture/release lifecycle, not just a single charge) and is worth deciding deliberately rather than defaulting.
3. **Refund policy.** If a renter cancels a `pending` request pre-payment, that's free (no charge exists yet, if payment happens at approval — see §4). If a renter cancels an `approved` (already-paid) booking, or the owner cancels an approved booking, what's refunded — full, partial by a cancellation window (e.g. free >48h before start, non-refundable inside 24h), or none? This is a direct product-policy decision, not something to infer from the existing booking-status trigger logic.
4. **Canadian GST/HST on the platform's own commission.** RentalTool's commission is a taxable supply of a service in Canada; standard federal registration applies once RentalTool's own taxable revenue exceeds the $30,000 CAD small-supplier threshold over four consecutive quarters, same as any Canadian business — below that, registration is optional. [Source: Stripe — Understanding the tax obligations of marketplaces in Canada](https://stripe.com/guides/understanding-the-tax-obligations-of-marketplaces-in-canada) Separately, **Canada's "platform economy" GST/HST rules (in force since July 2021) can make a digital platform itself responsible for collecting and remitting GST/HST on behalf of individual, non-GST-registered sellers in specific facilitated-supply categories** (short-term accommodation platforms are the clearest, most-litigated example). Whether P2P tool rental facilitated through RentalTool falls under one of these deemed-platform categories, as opposed to leaving each individual tool owner responsible for their own GST/HST once *they* cross $30,000 CAD in their own rental income, is a real open question this document is not qualified to answer definitively — **this needs a Canadian accountant/tax advisor's sign-off before launch**, not an engineering guess. Flagging it now so it's budgeted as a real pre-launch step, not a surprise later.
5. **Payout timing and cadence.** Does an owner get paid out instantly on Stripe's standard schedule (Express default), or does RentalTool want to hold funds until some "booking completed" confirmation to reduce dispute exposure? This is a policy call with direct UX consequences (§4 below).

## 4. Rough technical shape, if/when built

### 4.1 Schema additions (illustrative, not a final design)

A new `payments` (or `transactions`) table, one row per Stripe PaymentIntent, referencing `bookings`:

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `booking_id` | references `bookings(id)` — one payment per booking for MVP-of-payments; a damage deposit, if Max decides to add one (§3.2), would likely be a second row/type rather than overloading this one |
| `stripe_payment_intent_id` | Stripe's id, source of truth for status |
| `amount_total`, `amount_platform_fee`, `amount_owner_payout` | captured at charge time, since a listing's price can change after a historical booking |
| `status` | mirrors Stripe's PaymentIntent lifecycle (`requires_payment_method`, `succeeded`, `refunded`, etc.) — do not hand-roll a separate status machine that can drift from Stripe's actual state; treat Stripe webhooks as the source of truth and this column as a cache of it |
| `created_at`, `updated_at` | |

Plus a `stripe_account_id` column on `profiles` (or a small `owner_payout_accounts` table) recording each owner's connected Express account id and whether onboarding is complete — an owner can't receive a payout until Stripe's own hosted onboarding confirms they've provided the required identity/bank info.

### 4.2 What changes in the booking flow

This is the single biggest product decision buried inside "add payments," bigger than picking an account type: **when does money actually move relative to the existing `pending → approved → cancelled` flow from M5?** Three real options:

- **A — Pay at approval, not at request.** Renter submits a request exactly as today (no payment yet); only once the owner approves does the renter get prompted to pay, and the booking isn't truly confirmed until payment succeeds. Closest to the current UX and mental model — a request is still a request, not a purchase — and avoids charging renters for requests that get declined. **Recommended default** absent a reason to prefer otherwise, precisely because it's the smallest change to the flow this app's users already understand.
- **B — Pay at request time, held/authorized (not captured) until approval.** Uses Stripe's manual-capture PaymentIntents: authorize the full amount when the request is created, capture only on owner approval, cancel the authorization automatically if declined/expires. Better guarantee that an approved booking is *actually* paid (no "approved but then renter vanishes without paying" gap that option A leaves open) but real added complexity: authorization holds expire (Stripe's card auth holds are time-limited), so a slow-to-respond owner can cause a renter's card hold to lapse and need re-authorization. It also interacts with the existing double-booking rule in a way worth flagging: per M5's design (`booking_has_approved_overlap`), any number of `pending` requests can exist on overlapping dates — only an `approved` booking blocks. Under Option B that means multiple renters could simultaneously hold a card authorization on the same dates until the owner approves one and the rest are voided at checkpoint 2 — not a problem, just a real consequence of layering payments onto the existing pending-doesn't-block semantics that Option A avoids entirely (nothing is authorized until one request is already approved).
- **C — Pay upfront and skip the approval step entirely** (payment = the request). Simplest of all three, but changes the product's actual behavior — it removes the owner's ability to vet/decline a request before money moves, which is a real behavior change from the MVP's current owner-approves-first model, not just a payments add-on. Not recommended without Max explicitly deciding he wants to drop the approval gate, which is a bigger call than payments itself.

Whichever option, funds should be **held by Stripe and released to the owner on a schedule Max decides in §3.5** (immediately on capture, or delayed until some "rental period ended" signal) — not released instantly by default without thinking about the dispute-exposure tradeoff Stripe's own docs call out for Express accounts.

### 4.3 Account type recap

Express, per §1 — RentalTool does not want to be the sole liable party's *only* option here, but Standard's "owner handles their own Stripe dashboard and disputes" is unrealistic for casual individual tool owners, and Custom's engineering lift isn't justified pre-revenue. Express is the documented middle ground built for exactly this shape of marketplace.

## 5. Honest scope/cost estimate

Relative to the milestones actually built so far (M2 auth through M14's robustness pass — the whole non-payments product, including two full client apps and a review system), **a first real payments milestone is comparable in size to M5 (the booking flow itself) plus M2 (auth) combined, not a small add-on.** Concretely, it requires:

- A new, separate money-handling surface that must be *correct*, not just functional — bugs in booking-status logic show up as a wrong badge; bugs in payment-capture logic show up as real money in the wrong place. This raises the QA bar significantly above every prior milestone (real Stripe test-mode flows, webhook-delivery testing, retry/idempotency testing — none of which any milestone so far has needed).
- Stripe account creation and business verification (external to this repo, needs Max personally — Stripe requires a real business/individual identity behind the platform account) before a single line of integration code can even be tested end-to-end, even in test mode for the platform account itself.
- Webhook infrastructure that doesn't exist anywhere in this stack today (Vercel serverless function(s) or a Supabase Edge Function verifying Stripe signatures, handling out-of-order/duplicate delivery — a genuinely new operational surface, not an extension of the existing server-action pattern).
- Express Connect onboarding UX for tool owners (a new, real user flow — "become a payout-eligible owner" — layered onto the existing owner/listing flow).
- The three business decisions in §3 resolved *before* implementation starts, or the schema/flow gets built twice.
- A Canadian tax-compliance answer (§3.4) and ideally a brief lawyer consult (§2) as real pre-work, not afterthoughts.

Rough order of magnitude: **if M2-M14 collectively represents "the app," a correctly-built first payments milestone is roughly a 2-3 milestone-equivalent effort by itself** (schema + Connect onboarding + checkout/capture flow + webhook handling + QA to a much higher bar than prior milestones, realistically split across 2-3 sequential milestones rather than one) — before counting the external, non-engineering steps (Stripe business verification, legal/tax consults) that gate it and aren't on this project's normal cost meter at all.

## 6. What this document is not

Not a request for Max to decide anything right now. Per Max's explicit instruction, this is planning-only — no Stripe account, no payment code, no schema migration, no money movement. §3's business questions are listed so they're ready to answer in one sitting whenever Max decides to move forward, not because an answer is needed today.

---

## Sources

- [Stripe — Connected account types (Standard/Express/Custom comparison)](https://docs.stripe.com/connect/accounts)
- [Stripe — What is a money transmitter?](https://stripe.com/resources/more/what-is-a-money-transmitter)
- [Stripe — Understanding the tax obligations of marketplaces in Canada](https://stripe.com/guides/understanding-the-tax-obligations-of-marketplaces-in-canada)
- [Stripe — How to collect GST in Canada](https://stripe.com/resources/more/how-to-collect-gst-in-canada)
