# Yayınlama Rehberi (F2) — Cloudflare Workers

> **v2 (22 Kasım 2026):** Cloudflare'in "Connect to Git" akışı artık Pages projesi değil, **statik dosya servis eden Worker** oluşturuyor. Bu rehber ona göre yeniden yazıldı.
> - Statik dosya istekleri ücretsiz ve sınırsız. Worker'larda kod çalıştırmadığımız için maliyet sıfır kalıyor.
> - `_headers` dosyaları (CSP, noindex, önbellek) Workers'ta da aynen çalışıyor.

## 0. İki Worker, iki rol

| | Uygulama | Sandbox |
|---|---|---|
| Worker adı | `python-educrs` (zaten oluşturdun) | `python-educrs-run` |
| Adres | **`python.educrs.com`** | `python-educrs-run.<hesap>.workers.dev` |
| Yapılandırma | `apps/web/wrangler.jsonc` | `apps/run/wrangler.jsonc` |

**Neden sandbox `workers.dev`'de kalıyor?** `workers.dev` Public Suffix List'te (22.11.2026'da doğrulandı). Bu yüzden `python.educrs.com` ile **ayrı site** sayılıyor ve kullanıcı kodu uygulamanın verisine erişemiyor (plan §3.1). **Sandbox'a `educrs.com` altında bir alan adı verme.**

## 1. Önce sandbox Worker'ını oluştur

Cloudflare → **Workers & Pages → Create → Import a repository** → `python-educrs` deposu.

| Ayar | Değer |
|---|---|
| Project / Worker name | `python-educrs-run` (`wrangler.jsonc` içindeki adla **aynı** olmalı) |
| Build command | `pnpm --filter run build` |
| Deploy command | `npx wrangler deploy --config apps/run/wrangler.jsonc` |
| Non-production branch deploy command | boş bırak (sandbox için önizleme gerekmiyor) |
| Path / root directory | `/` |
| Build variables | `NODE_VERSION` = `22.23.4` · `APP_ORIGIN` = `https://python.educrs.com` · `WRANGLER_SEND_METRICS` = `false` |

İlk deploy bitince Worker sayfasında görünen adresi kopyala, örneğin `https://python-educrs-run.<hesap>.workers.dev`. Bir sonraki adımda lazım olacak.

## 2. Uygulama Worker'ının ayarlarını düzelt

`python-educrs` → **Settings → Build**:

| Ayar | Değer |
|---|---|
| Build command | `pnpm --filter web build` |
| Deploy command | `npx wrangler deploy --config apps/web/wrangler.jsonc` |
| Non-production branch deploy command | `npx wrangler versions upload --config apps/web/wrangler.jsonc` |
| Path / root directory | `/` |
| Build variables | `NODE_VERSION` = `22.23.4` · `PUBLIC_RUN_ORIGIN` = *1. adımda kopyaladığın sandbox adresi* · `WRANGLER_SEND_METRICS` = `false` |

> ⚠️ `PUBLIC_RUN_ORIGIN` bilerek zorunlu tutuldu. Eksikse derleme hata verip durur, böylece site yanlış bir sandbox'a bağlanmaz.
> Adres sonunda `/` olmadan, yalnızca origin olarak yazılmalı: `https://...workers.dev`

Bu yapılandırma `main` dalında PR #1 birleştikten sonra devreye girer. O zamana kadar Worker'ın derlemesi başarısız olabilir, bu normal.

## 3. Alan adı: `python.educrs.com`

`python-educrs` → **Settings → Domains & Routes → Add → Custom domain**:
- Alt alan adı kutusuna sadece **`python`** yaz. Sonundaki `.educrs.com` kısmı zaten sabit.
- **"Invalid subdomain" hatası alırsan:** Kutuyu tamamen temizle (⌘A, sonra sil) ve `python` kelimesini **elle** yaz. Bu hata çoğunlukla kopyala-yapıştırla gelen görünmez bir karakterden (sondaki boşluk ya da biçimlendirme karakteri) kaynaklanır.
- Enable for: **Production**.

Alan adı bağlandıktan sonra uygulamanın `workers.dev` adresi kapanacak (`apps/web/wrangler.jsonc` → `"workers_dev": false`). Uygulama sadece `python.educrs.com`'dan servis edilmeli. Sandbox da zaten yalnızca bu adresten gömülmeye izin veriyor.

## 4. Doğrulama

1. `https://python.educrs.com` adresini aç. "Python is ready" yazısını gör, kodu çalıştır ve `input()`'a bir cevap yaz.
2. **Mac'te Safari'de ve iPhone'da** aynısını dene. F1'den kalan en önemli açık madde bu (`docs/03-f1-spike-report.md` §5.2).
3. Bir eski Android telefonda dene. İlk açılış süresini not et.
4. Tarayıcı geliştirici araçlarında yanıt başlıklarına bak: `Content-Security-Policy` ve `X-Robots-Tag: noindex` görünmeli.

## 5. Bilinen sınır: önizlemeler

PR önizlemeleri `*-python-educrs.<hesap>.workers.dev` adresinde açılıyor. Ama sandbox şu an sadece `https://python.educrs.com` tarafından gömülebiliyor, bu yüzden **önizlemelerde Python kutusu çalışmaz.**

Çözüm F3'te: sandbox'a izin verilen origin listesi + el sıkışma protokolü. Bunu yaparken bir noktaya dikkat edilecek: önizleme adresiyle sandbox aynı `<hesap>.workers.dev` altında olduğu için **birbirleriyle aynı site** sayılırlar. Önizlemeler gerçek kullanıcı verisi taşımamalı.

## 6. Firebase (henüz gerekmiyor)

Firebase'e F8'de (hesap ve senkron) ihtiyaç olacak. Hazırlık olarak yapılabilecekler:
- Yeni bir proje aç (ör. `educrs-python`). Fatura hesabı bağlama, proje **Spark**'ta kalsın.
- Authentication'ı **Identity Platform'a yükseltme** (Spark'ta günde 3.000 aktif kullanıcı sınırı getirir).
