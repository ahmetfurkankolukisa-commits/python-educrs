# futurecoder İncelemesi (F0)

> **İncelenen:** [alexmojaki/futurecoder](https://github.com/alexmojaki/futurecoder), commit `def491c` (16 Mart 2026). Lisans: **MIT** (© 2020 Alex Hall).
> **Yöntem:** Kaynak kod okundu (çalıştırılmadı). Bağımlılıkların sağlığı 22 Kasım 2026'da PyPI ve npm'den kontrol edildi.
> **Sonuç özeti:** **Fikirler son derece değerli. Ön yüz kodu kullanılamaz durumda. Python çekirdeği bize referans olur, bağımlılıklarının yarısı bakımsız.**

---

## 1. futurecoder nedir?

Yeni başlayanlar için Pyodide ile tarayıcıda çalışan, ücretsiz ve açık kaynak bir Python kursu. Bizim problemimizin neredeyse aynısını çözüyor. Tek geliştiriciye dayanan, yıllardır yaşayan ve 7 dile çevrilmiş olgun bir proje.

| Bölüm | İçerik |
|---|---|
| `core/` (Python, Pyodide içinde çalışır) | Ders modeli (`Page`/`Step` sınıfları), kontrol motoru, alıştırma testleri, hata mesajları, i18n |
| `core/chapters/` | 12 bölüm (shell'den sözlüklere kadar), ~11.800 satır. 92 ipucu bloğu, 25 yanılgı mesajı, ~110 çıktı tahmini/Parsons/yasak yapı kullanımı |
| `core/runner/` | Çalıştırıcı: değişken değerli hata izi, birdseye/snoop hata ayıklayıcıları, friendly-traceback |
| `frontend/` | React 17 + Create React App, Redux, Ace editör, Bootstrap 4, Firebase v8 |
| `tests/` | Her adımın tam çıktısını dil başına "golden file" olarak kaydeden testler |
| Veri | Firebase **Realtime Database**, kullanıcı durumu tek doküman |

## 2. Alacağımız fikirler (tasarım; kod değil)

Bunlar ana planı değiştiriyor (bkz. §3.2, §3.7 güncellemeleri).

| # | Fikir | futurecoder'da nasıl | Bizde nasıl |
|---|---|---|---|
| F1 | **Fonksiyonlaştırma** (en değerli fikir) | Fonksiyon öğrenilmeden önceki alıştırmalar girdi atamalarıyla başlar (`sentence = 'Hello'`, `excited = True`). Kontrol motoru bu satırları ayırır, programı fonksiyona çevirir ve **başka girdilerle** çalıştırır. | Yeni kontrol türü `program-with-inputs`. Öğrenci fonksiyonları bilmeden de "kodun sadece bu örnek için değil, genel olarak doğru mu?" sorusu test edilebiliyor. Yoksa öğrenci `print('Hello!?')` yazıp geçebilir. |
| F2 | **Referans çözüme karşı rastgele test** | Çözüm fonksiyonunun tip ipuçlarından (`str`, `bool`, `list[int]`) 10 rastgele girdi üretilir. Öğrencinin çıktısı çözümünkiyle karşılaştırılır. | `solution.py` içinde tip ipuçlu `solve` fonksiyonu. Yazarın verdiği testlere ek olarak N rastgele test. **Bizim farkımız:** rastgele üreteç tohumlanır ve tohum `exercise.attempt` olayına yazılır. Böylece her deneme birebir yeniden üretilebilir (determinizm ilkesi). |
| F3 | **Yanılgı tespiti = küçük sınıflar** (`MessageStep`) | Her bilinen hata ayrı bir kontrol olarak yazılır ve yanında **o hatayı tetikleyen örnek program** bulunur. CI, mesajın gerçekten tetiklendiğini test eder. | Yanılgı kataloğumuza (§9.2 H) birebir uyuyor. Kural: **örnek tetikleyicisi olmayan yanılgı kontrolü kabul edilmez.** Ek fikir: **davranışsal eşleşme.** Öğrencinin çıktısı, bilinen yanlış programın çıktısıyla bütün testlerde aynıysa o yanılgı teşhis edilir. AST kalıbı yazmaktan çok daha kolay. |
| F4 | **Yasak yapı + adet sınırı** (`Disallowed`) | AST şablonu, `max_count` ve özel mesaj ("bu alıştırmada `sum` kullanma"). | §3.2'deki AST kurallarına `max_count` eklenir. |
| F5 | **Kademeli çözüm gösterimi** | Son ipucu basamağında çözüm token token, rastgele sırayla açılır. Öğrenci her tıklamada biraz daha görür. İsterse çözüm Parsons bulmacası olarak da verilir. | İpucu merdiveninin son basamağı "çözüme bak" yerine **kısmi açma** olur. BKT etkisi: açılan oran `r` < %30 ise `w = 0.25`, değilse `w = 0` (§3.4.1). |
| F6 | **Çıktı tahmini + her zaman "Hata" seçeneği** | Çoktan seçmeli tahmin listesine her zaman "Error" seçeneği eklenir. | `predict-output` alıştırma türü. "Hata verir" seçeneği her zaman var, çünkü yeni başlayanın en çok öğrenmesi gereken şey bu. |
| F7 | **Aynen yaz** (`VerbatimStep`) | İlk derslerde gösterilen kod aynen yazılır. Karşılaştırma boşluklara toleranslı AST karşılaştırmasıdır. | `verbatim` alıştırma türü (M0–M1). Klavye ve sözdizimi alışkanlığı kazandırır. |
| F8 | **Golden file testleri** | CI her adımın çözümünü ve her yanılgı mesajının örnek programını çalıştırır. Öğrencinin göreceği **tam yanıt** JSON olarak kaydedilir. PR'daki fark, öğrenci deneyiminde neyin değiştiğini gösterir. | §3.7'ye eklenir. "Çözüm geçer, başlangıç kodu kalır" kontrolünden çok daha güçlü: bir hata mesajının metni bile değişse PR'da görünür. |
| F9 | **Değişken değerli hata izi** | `stack_data` + `executing` ile, hata veren satırdaki değişkenlerin değerleri gösterilir (`x = 5, items = [1, 2]`). | Hata açıklayıcısının temeli olur. Yeni başlayan için "neden" sorusunun yarısını cevaplar. |
| F10 | **Sadece başarısızlıkta lint** | `pyflakes` uyarıları (kullanılmayan değişken, tanımsız isim) sadece alıştırma geçmediğinde gösterilir. | Aynen alınır. Başarılı öğrenciyi gereksiz uyarılarla boğmayız. |
| F11 | **Metin tabanlı izleme** (`snoop`) | Kodun her satırı çalışırken değişken değişimleri metin olarak yazılır. | Görsel izleyicinin **ekran okuyucu dostu metin alternatifi** (§9.2 S) olur. |
| F12 | **Soru sihirbazı** | Takılan öğrenciye forumda iyi bir soru sormayı öğretir (minimal örnek, beklenen ve gerçek çıktı). | Topluluk özelliğiyle birlikte (§9.3), F12+ fazında. |

## 3. Bağımlılıklar: kabul kriterlerimizden (§2.4.1) geçiyor mu?

| Paket | Son sürüm | Lisans | Karar |
|---|---|---|---|
| `executing` | 2026-10 | MIT | ✅ **Alınır** (F9 için) |
| `asttokens` | 2026-07 | Apache-2.0 | ✅ **Alınır** |
| `pure_eval` | 2026-09 | MIT | ✅ **Alınır** |
| `snoop` | 2026-07 | MIT | ✅ **Alınır** (F11) |
| `pyflakes` | 2026-10 | MIT | ✅ **Alınır** (F10) |
| `stack_data` | 2023-09 | MIT | 🟡 **Şartlı alınır.** 6 ay kuralından kalıyor, ama IPython'un çekirdek bağımlılığı (yaygın kullanılan, kararlı). Python 3.14 + Pyodide uyumu F1'de test edilecek. Uyumsuzsa yerine F9 için kendi ince sarmalayıcımız (`executing` + `pure_eval`) yazılır. |
| `cheap_repr` | 2024-08 | MIT | 🟡 Küçük, **kopyalanır (vendor)** |
| `astcheck` | 2024-01 | — | ❌ Kendi AST şablon eşleştiricimiz (zaten §3.2'de var) |
| `python-runner` | 2022-06 | MIT | ❌ Bakımsız. Referans olarak okunur, kendi runner'ımız yazılır (sandbox protokolümüz farklı). |
| `pyodide-worker-runner` | 2024-09 | MIT | ❌ Pyodide 0.26 dönemi API'si. Referans olarak okunur. |
| `sync-message`, `comsync` | 2023 | MIT | 🟡 Küçük, **kopyalanır (vendor)** (§3.1) |
| `birdseye` | 2025-09 | MIT | ❌ Ağır, kendi arayüzünü gerektiriyor. Bizim tracer'ımız (§3.3) bu ihtiyacı karşılıyor. |
| `friendly-traceback` | 2022-11 | — | ❌ Bakımsız (zaten §9.2 U'da elendi) |
| `didyoumean` | 2012 | — | ❌ Gereksiz: Python 3.10'dan beri CPython "Did you mean…?" önerilerini kendisi veriyor, 3.12–3.14'te bu öneriler daha da gelişti. |
| `BetterErrorMessages` | 2017 | belirsiz | ❌ Bakımsız, lisans belirsiz |

## 4. Almayacaklarımız ve nedenleri

| Konu | futurecoder | Neden almıyoruz |
|---|---|---|
| Ön yüz | React 17, Create React App (artık geliştirilmiyor), Redux, Ace, Bootstrap 4, Firebase v8 | Bizim yığınımızla (Astro + Svelte 5 + CodeMirror 6 + Firebase 13) uyumsuz ve eskimiş |
| **Güvenlik izolasyonu** | Pyodide worker'ı sitenin kendi origin'inde çalışıyor. Aynı origin'de `localforage` (IndexedDB) ve Firebase oturumu duruyor. | Bizim §9.1 A'da bulduğumuz açığın ta kendisi. futurecoder bu riski kabul etmiş, biz sandbox'ı ayrı bir siteye taşıyarak kapatıyoruz. |
| Görselleştirici | Kodu **pythontutor.com'a gönderen** bir iframe | Kod üçüncü taraf bir sunucuya gidiyor (gizlilik), çevrimdışı çalışmıyor. Bizim tracer'ımız tamamen tarayıcıda. |
| Veri modeli | Realtime DB'de tek kullanıcı dokümanı, son yazan kazanır | İki cihaz çakışırsa ilerleme kaybolabilir. Bizim olay kaynaklı CRDT modelimiz bu riski sıfırlıyor (§3.6). |
| İçerik formatı | Dersler Python sınıfları olarak yazılmış (`class Step`, docstring) | Katkı vermek için Python sınıflarını bilmek gerekiyor, şema doğrulaması zor. Bizde MDX + YAML + `.py` dosyaları. Ama F2'nin avantajını koruyoruz: çözüm yine tip ipuçlu gerçek bir fonksiyon. |
| Sürümler | Python 3.12.1, Pyodide 0.26 | Biz Python 3.14.2 / Pyodide 314.x kullanıyoruz |

## 5. İçerik: yeniden kullanım seçeneği

futurecoder'ın 12 bölümlük ders içeriği de MIT lisanslı ve İngilizce. Kaynak gösterilerek (MIT bildirimi korunarak) uyarlanabilir, CC BY-SA içeriğimizle de lisans açısından uyumlu.
- **Öneri:** Ders metinlerini olduğu gibi almayalım, çünkü pedagojik akışımız (PRIMM, Parsons, beceri haritası) farklı. Ama **alıştırma fikirleri, testleri ve yanılgı mesajları** M1–M10 taslakları için çok iyi bir başlangıç havuzu. 92 ipucu bloğu ve 25 yanılgı tespiti, §9.2 J'deki içerik darboğazını doğrudan hafifletir.
- Her uyarlanan alıştırmanın meta verisine `source: futurecoder@def491c` yazılır. Lisans bildirimi `content/THIRD_PARTY.md` dosyasında tutulur.

## 6. Ana plana etkisi (v0.8)

1. **§3.2 Grader:** yeni kontrol türleri `program-with-inputs` (F1), tohumlu rastgele testler (F2), davranışsal yanılgı eşleşmesi + zorunlu örnek tetikleyici (F3), `max_count` (F4), sadece başarısızlıkta lint (F10), değişken değerli hata izi (F9).
2. **Alıştırma türleri:** `verbatim` (F7) ve `predict-output` (her zaman "Hata" seçeneğiyle, F6) ilk sürümden itibaren listede.
3. **İpucu merdiveni:** son basamak kısmi çözüm açma (F5). BKT ağırlığı açılan orana bağlandı.
4. **§3.7 CI:** golden file testleri (F8).
5. **Erişilebilirlik:** `snoop` tabanlı metin izleme (F11).
6. **Bağımlılık listesi:** §3'teki tablo kesinleşti.
7. **İçerik:** futurecoder alıştırma havuzu M1–M10 taslakları için kaynak gösterilerek kullanılabilir.
