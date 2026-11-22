# F1 Teknik Keşif (Spike) Raporu

> **Tarih:** 22 Kasım 2026 · **Kod:** `spikes/f1-sandbox/` (geçici prototip) · **Ham sonuçlar:** `spikes/f1-sandbox/results.json`
> **Ortam:** Pyodide 314.0.8 (Python **3.14.2**), Playwright 1.65.1 · Chromium 159, Firefox 159, WebKit 27.2
> **Yeniden çalıştırma:** `cd spikes/f1-sandbox && npm install && npx playwright install && node run-spike.mjs`

## 1. Sonuç

**Ana mimari kararı (§3.1, COI'siz sandbox) kanıtlandı.** Üç tarayıcı motorunda 22'şer kontrol, toplam **66/66 geçti.**

Fazın otomatikleştirilebilen kısmı tamam. Gerçek cihaz, gerçek ağ ve Firebase hesabı gerektiren maddeler açık kaldı (§5).

## 2. Ne kuruldu?

| Site | Adres | Rolü |
|---|---|---|
| app | `http://localhost:4100` | Uygulama. Test için `localStorage`, IndexedDB ve çereze "sır" yazar. |
| run | `http://127.0.0.1:4200` | Sandbox: iframe + Pyodide worker + service worker. Katı CSP. |
| evil | `http://127.0.0.1:4300` | Saldırgan. Kendisine gelen her isteği kaydeder. |

`localhost` ile `127.0.0.1` tarayıcı için **farklı sitelerdir**. Bu düzen, canlıdaki `python.educrs.com` ↔ `*-run.pages.dev` ayrımını birebir modelliyor.

Sandbox CSP'si: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'; frame-ancestors http://localhost:4100`

## 3. Kontroller (her motorda)

| Grup | Kontrol | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| Çalıştırma | `print` çıktısı | ✅ | ✅ | ✅ |
| `input()` | Tek girdi, çoklu girdi | ✅ | ✅ | ✅ |
| `input()` | **Yavaş yazan kullanıcı:** 3,5 sn bekleme, service worker 3 tur yeniden denedi | ✅ | ✅ | ✅ |
| Durdurma | Sonsuz döngü durdu + sonraki çalıştırma sorunsuz | ✅ | ✅ | ✅ |
| Hijyen | `builtins.print` değiştirildi / `builtins` tamamen silindi | ✅ | ✅ | ✅ |
| Hijyen | Global değişken sızıntısı, `sys.stdout` ele geçirme | ✅ | ✅ | ✅ |
| Hijyen | Önceden yüklenmiş modülü değiştirme (`json.dumps = None`) | ✅ | ✅ | ✅ |
| Hijyen | **Sabotaj:** kullanıcı kodu `gc` ile sandbox fonksiyonlarımızı bozdu → sistem fark etti, worker'ı yeniledi | ✅ | ✅ | ✅ |
| Hata | Hata izi sadece kullanıcı satırlarını gösteriyor (Pyodide iç yapısı gizli) | ✅ | ✅ | ✅ |
| Hata | `stack_data` ile değişken değerli hata (`i = 3`, `items[i]`) | ✅ | ✅ | ✅ |
| Tracer | 1000 adımlık iz < 500 ms | ✅ | ✅ | ✅ |
| **Saldırı** | Depolama: uygulamanın IndexedDB/localStorage verisine erişim yok | ✅ | ✅ | ✅ |
| **Saldırı** | Ağ: `fetch`, XHR, WebSocket, EventSource, `importScripts` dışarıya çıkamıyor; kötü niyetli sunucuya **0 istek** ulaştı | ✅ | ✅ | ✅ |
| **Saldırı** | `eval` engellendi | ✅ | ✅ | ✅ |
| **Saldırı** | Sahte mesajlar: uydurma `result`/`evil` mesajları düşürüldü, HTML çıktı düz metin kaldı, `alert` çalışmadı | ✅ | ✅ | ✅ |
| **Saldırı** | `frame-ancestors`: saldırgan sitesi sandbox'ı gömemiyor | ✅ | ✅ | ✅ |
| Önbellek | Sayfa yeniden yüklenince service worker tekrar kontrolü alıyor | ✅ | ✅ | ✅ |

## 4. Ölçümler

| Ölçü | Chromium | Firefox | WebKit | Hedef |
|---|---|---|---|---|
| Soğuk açılış (Pyodide hazır) | 737 ms | 775 ms | 753 ms | — |
| Önbellekli açılış | 603 ms | 757 ms | 769 ms | < 1 sn ✅ |
| Durdur → sonuç | 1 ms | 2 ms | 1 ms | < 100 ms ✅ |
| Durdurduktan sonra yeni çalıştırmaya hazır olma | 0 ms (sıcak yedek) | 0 ms | 0 ms | anında ✅ |
| 1000 adımlık iz | 15 ms (+8 ms JSON) | 38 ms (+11 ms) | 14 ms (+8 ms) | < 500 ms ✅ |
| İz boyutu (delta kodlamasız) | 724 KB | 724 KB | 723 KB | → delta kodlama gerekli |
| Çalıştırma sonrası modül geri yükleme | 0,5 ms (165 modül) | 1 ms | ~0 ms | ihmal edilebilir ✅ |

⚠️ **Açılış süreleri yerel ağda (loopback) ölçüldü.** Gerçek internette ~14 MB'lık ilk indirme bunun çok üstünde sürer. Önbellekli açılışın süresini ağ değil, WebAssembly derlemesi ve Python başlatması belirliyor (~0,6–0,8 sn).

## 5. Bulgular

### 5.1 Plana etki eden bulgular

1. **CSP için `'unsafe-eval'` gerekmiyor.** Pyodide 314 sadece `'wasm-unsafe-eval'` ile çalışıyor. `eval` kullanıcı kodu için de engelli kalıyor. Güvenlik açısından en iyi sonuç bu.
2. **Firefox ve WebKit'te sayfa açılınca service worker kontrolü kendiliğinden gelmiyor.** Üçüncü taraf iframe'de çalışan service worker aktif olsa bile sayfa kontrolsüz açılabiliyor. **Çözüm:** service worker'a açıkça `claim` mesajı göndermek. Bu sorun çözülmeden önce Firefox yeniden yüklemede 5,7 sn bekleyip yedek yola düşüyordu.
3. **WebKit'te CSP'nin engellediği `fetch` hiç sonuçlanmıyor** (ne hata veriyor ne yanıt). Veri sızmıyor, ama öğrencinin programı takılı kalıyor. "Durdur" ve sıcak yedek worker bunu kapatıyor. Hata açıklayıcısına "ağ erişimi yok" mesajı eklenecek.
4. **Önceden yüklenmiş modüllerin sığ anlık görüntüsü şart.** Pyodide açılışta 165 modülü yüklüyor. Kullanıcı bunlardan birinin fonksiyonunu değiştirirse (ör. `json.dumps = None`), değişiklik sonraki çalıştırmaya taşınıyor. Anlık görüntüden geri yükleme ~1 ms sürüyor.
   - Bu sırada **kendi hatamı da buldum:** atlama listesindeki `"js"` öneki `"json"`'u da yutuyordu. Paket adları artık tam eşleşmeyle karşılaştırılıyor.
5. **Süreç içi hijyen "en iyi çaba" düzeyinde kalıyor.** Kullanıcı kodu `gc.get_objects()` ile sandbox fonksiyonlarımıza ulaşıp onları bozabiliyor. Sistem bunu fark edip worker'ı yeniliyor (test edildi).
   - **Karar:** Notlandırılan kontroller ("Kontrol Et") her zaman **taze bir worker'da** çalışacak. Sıcak yedek worker sayesinde bunun ek maliyeti yok.
6. **`stack_data` (son sürümü 2023) Python 3.14'te sorunsuz çalışıyor.** futurecoder incelemesindeki şartlı kabul (`docs/02` §3) artık kesin kabul.
7. **İz boyutu büyük:** Delta kodlama olmadan 1000 adım 724 KB tutuyor. Görselleştirici verisini taşırken §3.3'teki delta kodlama ve checkpoint yaklaşımı gerçekten gerekli.
8. **Grader'ın kendine ait referansları önceden bağlaması işe yarıyor:** `TracebackException` açılışta bağlandığı için, kullanıcı `traceback` modülünü değiştirse bile hata raporlaması bozulmuyor. Bu desen bütün grader koduna uygulanacak.

### 5.2 Açık kalan maddeler (otomatik test edilemedi)

| Madde | Neden açık | Kim, nasıl |
|---|---|---|
| **Gerçek Safari / iOS Safari** | Playwright WebKit, Safari'nin izleme korumasını ve üçüncü taraf service worker politikasını birebir taşımıyor. **En büyük kalan risk bu.** | F2'de önizleme ortamına deploy edildikten sonra senin iPhone'unda ve Mac'inde Safari ile denenecek |
| Düşük donanımlı Android | Gerçek cihaz gerekiyor | Önizleme ortamında, eski bir Android telefonda |
| Gerçek ağda soğuk açılış | Loopback gerçekçi değil | Önizleme ortamında (Cloudflare) yavaş 3G simülasyonuyla |
| Firebase: yeni proje, Identity Platform durumu, yetkili alan adı, OAuth alan adı doğrulaması | Senin hesabın gerekiyor | Senin yapacağın adımlar (konsol) |
| CPython 3.14 ile Pyodide arasındaki davranış eşliği | Bu makinede CPython 3.14 yok (3.15.2 kurulu) | F2 CI'da (`setup-python 3.14`) |
| Mobil sembol çubuğu prototipi | Arayüz işi, sandbox riskine bağlı değil | F3 (MVP-0) içinde |
| Uygulama düzeyinde çevrimdışı çalışma | Bu spike sadece sandbox'ı kapsıyordu | F2 (uygulama service worker'ı) |

### 5.3 Canlı ortamda duman testi (22 Kasım 2026, `python.educrs.com`)

Üretim sitesi (Cloudflare Workers, gerçek internet) Playwright ile test edildi. Kod çalıştırma, `input()` ve Python sürümü kontrol edildi:

| Motor | Python hazır olma süresi (ilk açılış, önbellek boş) | Sonuç |
|---|---|---|
| Chromium | 3,6 sn | ✅ `Hello, Ada` · 3.14.2 |
| Firefox | 3,7 sn | ✅ |
| WebKit | 3,3 sn | ✅ |
| iPhone (WebKit emülasyonu) | 3,3 sn | ✅ |

- Ölçüm geniş bantlı bir bağlantıda yapıldı. Yavaş mobil ağ ve düşük donanımlı cihaz hâlâ açık.
- **Gerçek Safari ve iOS hâlâ açık.** Playwright WebKit gerçek Safari ile birebir aynı değil.
- **Yeni bulgu:** Cloudflare, HTML'in içine kenar sunucusunda kendi script'lerini ekliyor:
  - **Web Analytics beacon'ı:** Plandaki çerezsiz analitik buydu (§9.1 C), CSP'de açıkça izin verildi.
  - **"JavaScript Detections" (Bot Fight Mode) satır içi script'i:** İçeriği her istekte değiştiği için hash'le izin verilemiyor. `'unsafe-inline'` CSP'yi boşa çıkaracağı için **bilerek engelli bırakıldı**. Siteye bir zararı yok.

## 6. Prototipten ürüne taşınacaklar

- `run/sw.js`: senkron stdin protokolü (tur tabanlı yeniden deneme, `claim` mesajı) → `packages/runtime`
- `run/bootstrap.py`: hijyen (builtins, modül anlık görüntüsü, sys, cwd) ve önceden bağlanmış referanslar → `packages/runtime/python`
- `run/host.js`: worker havuzu (aktif + sıcak yedek), bozulma tespiti, mesaj doğrulama → `packages/runtime`
- `run-spike.mjs`: 22 kontrol → `packages/runtime` için Playwright e2e test paketi (CI'da 3 motorda)
- Tracer prototipi → `packages/tracer` (delta kodlama eklenecek)
