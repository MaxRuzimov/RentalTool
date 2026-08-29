# Loyiha: Tool Rental Marketplace (Canada / GTA)

## Biznes model
- P2P (Airbnb-style) — jismoniy shaxslar o'z asbob-uskunalarini boshqa foydalanuvchilarga ijaraga beradi
- Bozor: Kanada, GTA hududidan boshlab
- Kategoriya: barcha turdagi asbob-uskunalar (horizontal — bitta toifaga cheklanmagan)

## Platforma
- Web + Mobil (iOS va Android)

## MVP doirasi
- Maqsad: eng tez va arzon ishga tushirish, keyin kengaytirish
- Onlayn to'lov MVP'da YO'Q — foydalanuvchilar faqat e'lon ko'radi va bog'lanadi (chat yoki telefon orqali), to'lovni o'zaro kelishadi
- To'lov integratsiyasi keyingi bosqichda qo'shiladi

## Tavsiya etilgan tex-stack (tezlik/narx uchun optimallashtirilgan)
- Backend + DB + Auth: **Supabase** (Postgres, tayyor auth, real-time, arzon/bepul boshlang'ich tier)
- Web: **Next.js**, Vercel'da hosting (bepul tier bor)
- Mobil: **React Native (Expo)** — bitta kod bazasi, ikkala OS
- Rasm/fayl saqlash: Supabase Storage

## Stakeholder roli (Max)
- Faqat strategik qarorlar qabul qiladi
- Loyiha spec, dizayn, kod, review, deploy — jamoa tomonidan mustaqil bajariladi
- Max bilan faqat **cost** (xarajat) va katta strategik burilishlar muhokama qilinadi
