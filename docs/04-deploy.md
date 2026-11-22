# Yayınlama Rehberi (F2)

Bu rehber, kodu GitHub'a koymak ve iki siteyi Cloudflare Pages'te yayınlamak için **senin** yapman gereken adımları anlatır. Kodun kendisi hazır. Aşağıdaki adımlar hesap gerektirdiği için senin onayına ve eline bırakıldı.

## 1. GitHub deposu

- Depo herkese açık olacak (K12: kod MIT, içerik CC BY-SA).
- Önerilen ad: `python-educrs`.
- Commit'lerde gerçek e-posta değil, GitHub'ın `noreply` adresi kullanılıyor. Bu ayar sadece bu depoya özel.

## 2. Cloudflare Pages: iki proje

Cloudflare panelinde: **Workers & Pages → Create → Pages → Connect to Git** → `python-educrs` deposunu seç. Bu işlemi **iki kez** yap:

| Ayar | Proje 1: uygulama | Proje 2: sandbox |
|---|---|---|
| Proje adı | `educrs-python` | `educrs-python-run` |
| Production branch | `main` | `main` |
| Framework preset | None | None |
| Build command | `pnpm --filter web build` | `pnpm --filter run build` |
| Build output directory | `apps/web/dist` | `apps/run/dist` |
| Root directory | (boş = depo kökü) | (boş = depo kökü) |
| Ortam değişkenleri | `NODE_VERSION=22.23.4`, `PUBLIC_RUN_ORIGIN=https://educrs-python-run.pages.dev` | `NODE_VERSION=22.23.4`, `APP_ORIGIN=https://python.educrs.com` |

> ⚠️ Sandbox projesinin adı değişirse (`educrs-python-run` alınmışsa), uygulama projesindeki `PUBLIC_RUN_ORIGIN` değerini yeni adrese göre güncelle.

pnpm sürümü `package.json` dosyasındaki `packageManager` alanından okunur.

## 3. Alan adı

Uygulama projesinde (`educrs-python`): **Custom domains → Set up a domain → `python.educrs.com`**.

educrs.com'un DNS'i zaten Cloudflare'de olduğu için CNAME kaydı otomatik oluşur.

**Sandbox'a özel alan adı verme.** `*-run.pages.dev` adresinde kalması güvenlik gereği (plan §3.1): ayrı bir site olarak kalmalı.

## 4. Doğrulama

1. `https://python.educrs.com` adresini aç. "Python is ready" yazısını gör, kodu çalıştır ve `input()`'a bir cevap yaz.
2. **Mac'te Safari'de ve iPhone'da** aynısını dene. F1'den kalan en önemli açık madde bu (`docs/03-f1-spike-report.md` §5.2).
3. Bir eski Android telefonda dene. İlk açılış süresini not et.
4. Yanıt başlıklarında `X-Robots-Tag: noindex` olduğunu kontrol et (site, MVP testlerinden geçene kadar arama motorlarına kapalı).

## 5. Bilinen sınır: PR önizlemeleri

Cloudflare her PR için `<hash>.educrs-python.pages.dev` adresinde bir önizleme oluşturur. Ama sandbox şu an sadece `https://python.educrs.com` tarafından gömülebiliyor (`frame-ancestors` kuralı). Bu yüzden **önizlemelerde Python kutusu çalışmaz.**

Çözüm F3'ün işi: sandbox'a izin verilen origin listesi + el sıkışma protokolü. Bu yapılırken `postMessage` asla `"*"` hedefiyle gönderilmeyecek.

## 6. Firebase (henüz gerekmiyor)

Firebase'e F8'de (hesap ve senkron) ihtiyaç olacak. Hazırlık olarak yapılabilecekler:
- Yeni bir proje aç (ör. `educrs-python`). Fatura hesabı bağlama, proje **Spark**'ta kalsın.
- Authentication'ı **Identity Platform'a yükseltme** (Spark'ta günde 3.000 aktif kullanıcı sınırı getirir).
