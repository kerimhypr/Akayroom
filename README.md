# AKAYROOM

Koyu temalı, gerçek zamanlı topluluk iletişim uygulaması. Next.js 15, Firebase Auth + Realtime Database ve WebRTC mesh sinyalleşmesi ile kuruludur. Metin, sesli/görüntülü arama, ekran paylaşımı, DM, sunucu/kanal yönetimi, anlık tepkiler, anket, GitHub/müzik kartları ve komutlar içerir.

## Teknoloji

- **Frontend:** Next.js 15 (static export), React 19, TypeScript
- **Veritabanı:** Firebase Realtime Database (bölge: europe-west1)
- **Kimlik:** Firebase Auth (e-posta/şifre)
- **Sesli görüşme:** WebRTC mesh (sadece STUN — TURN henüz yok)
- **Dağıtım:** Render static_site (`out/`)

## Yerel kurulum

1. `.env.local.example` dosyasını `.env.local` olarak kopyala ve Firebase Web App yapılandırmasını gir.
2. Firebase Console'da **Authentication → Email/Password**'i etkinleştir ve bir Realtime Database oluştur.
3. Firebase CLI ile giriş yap ve kuralları yükle:

```bash
firebase login
firebase use --add      # proje: cizbull
firebase deploy --only database
```

4. Uygulamayı çalıştır:

```bash
npm run dev
```

> Not: PowerShell'de `npm` betiği çalışmaz. Build için `cmd /c "npm.cmd run build"` kullan.

## Üretim dağıtımı

Render static_site olarak çalışır: `npm install && npm run build` → `out/` yayınlanır. `main` dalına push otomatik dağıtımı tetikler. Render ortam değişkenlerinde `NEXT_PUBLIC_FIREBASE_*` değerleri ve (isteğe bağlı) `NEXT_PUBLIC_GIPHY_API_KEY` tanımlı olmalıdır.

## Cerebras AI Twin (isteğe bağlı, lokal)

AI Twin, çevrimdışı bahsedilen kullanıcı adına persona temsili yanıt üretir. Bulut tarafı gerekmediği için Spark planında kalınır; yerel bir Node worker ile çalışır.

1. Firebase Console → Project settings → Service accounts → Generate new private key.
2. İndirilen JSON'u web klasörü dışında sakla.
3. `worker/.env.example` dosyasını `worker/.env.local` olarak kopyala; service-account yolunu ve Cerebras anahtarını gir.
4. Kur ve çalıştır:

```bash
npm install --prefix worker
npm run twin:worker
```

Worker, Cerebras anahtarını tarayıcıdan uzak tutar. AI Twin yanıtlarının üretilmesi için worker'ın çalışıyor olması gerekir.
