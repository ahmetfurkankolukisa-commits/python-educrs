# F3 — Proje sahibinin değerlendirmesi (iskelet)

> MVP-0'ın çıkışı bu belgeyle yapılıyor (`docs/05-f3-mvp0.md` §9, K15–K16). Dış kullanıcı testi yok. Proje sahibi M0–M2'yi baştan sona dener, içerikten örnekler seçip inceler ve bulduklarını buraya yazar. F4 planı bu notlara dayanacak.
> İçerik İngilizce, bu belge Türkçe.

## 1. Nasıl denenir

- **Adres:** canlı site ya da yerelde `pnpm build:e2e`, ardından `node tools/serve-dist.mjs apps/web/dist localhost 4321` ve `node tools/serve-dist.mjs apps/run/dist 127.0.0.1 4322`.
- **Taze bir öğrenci gibi başlayın:** gizli pencere ya da ayarlardaki "Download my data" ile mevcut kaydı yedekleyip tarayıcı verisini silin.
- **En az bir kez telefonda** (iPhone, Safari) deneyin. Sembol çubuğu ve alttan açılan geri bildirim paneli orada önemli.
- **Süre ölçümü:** ana sayfadan ilk "Check"e kadar geçen süreyi ve her dersin süresini not edin (§4).

## 2. İçerik örneklemesi (K16)

Doğruluk CI'da otomatik denetleniyor: her çözüm, her yanlış kutucuk ve her yanılgı programı çalıştırılıyor, okunabilirlik ölçülüyor (§16.4). Sizin bakacağınız şey **öğretiyor mu**:
- açıklama yeterli mi
- sorular adil mi
- ipuçları gerçekten yardım ediyor mu
- geri bildirim doğru şeyi mi söylüyor

**Her modülden en az iki ders + proje** (öneri):

| Modül | Ders | Neden bu ders |
|---|---|---|
| M0 | `intro.program`, `intro.errors-are-normal` | İlk izlenim; hatalarla ilk karşılaşma |
| M1 | `strings.literal`, `strings.escape`, Kartvizit projesi | En çok yeni başlayan hatası; ters eğik çizgi kafa karıştırıcı |
| M2 | `vars.assign`, `vars.swap` | Atamanın yönü; ilk "zor" alıştırma (`rotate-three`) |

Her alıştırma için kısaca: ✅ iyi / ✏️ metin düzelmeli / ❌ soru değişmeli + bir cümle neden.

## 3. Bilerek yapılacak yeni başlayan hataları (§9)

Proje sahibi yeni başlayan değil. Bu yüzden şu hataları **bilerek** yapın ve gelen geri bildirimin anlaşılır olup olmadığını not edin:

| Hata | Nerede denenir | Beklenen |
|---|---|---|
| Tırnaksız metin: `print(Hello)` | `strings.literal/no-quotes` | "If you meant the text, put it in quotes" |
| Akıllı tırnak: `print(“Hi”)` | `strings.literal/curly-quotes` | Kıvrık tırnak açıklaması |
| Büyük harf: `Print("Hi")` | `print.basic/hello-world` | "Python cares about capital letters" |
| `print = "x"` sonra `print(...)` | `vars.naming/rename-it` | "you gave print a new value" |
| Fazladan girinti: satır başında boşluk | herhangi bir kod alıştırması | "This line starts with spaces it doesn't need" |
| Eksik parantez: `print("Hi"` | `intro.errors-are-normal/fix-the-bracket` | "this ( needs a )" |
| Ters atama: `"Ada" = name` | `vars.assign/swap-the-sides` | "Swap the two sides" |
| Takas hatası: `a = b` sonra `b = a` | `vars.swap/swap-two` | Sarı "Common mix-up" + geçici değişken önerisi |
| `+` ile birleştirme: `print("Hello," + name)` | `vars.use/greet-by-name` | Boşluk yanılgısı mesajı |
| İki kez yanlış, sonra "Show me" | herhangi bir adım | Cevap kademeli açılıyor, akış kilitlenmiyor |

## 4. Ölçümler

| Ölçü | Değer | Not |
|---|---|---|
| Ana sayfadan ilk "Check"e kadar | | Hedef: 60 saniyenin altında (§1) |
| M0 toplam süre | | |
| M1 toplam süre (proje dahil) | | |
| M2 toplam süre | | |
| Takıldığınız adımlar | | |
| Bulunan hatalar (uygulama) | | |
| Bulunan hatalar (içerik) | | |

## 5. Notlar

*(Serbest notlar: ne hoşa gitti, ne rahatsız etti, ne eksik. Görsel konular F3.8'de ele alınacak.)*
