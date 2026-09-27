# Validex

Validex, yerel işletmelerin Solana üzerinde USDC karşılığı tek kullanımlık kupon yayımladığı saklamasız bir pazaryeri prototipidir.

## İlk kilometre taşı

Bu başlangıç sürümü, ürünün en riskli iş kurallarını merkeze alır:

- Kampanya stok, tarih ve kullanıcı limiti kontrolü
- Kupon kimliğinin açık biçimde zincire yazılmaması
- Escrow modelinde güvenli komisyon hesabı
- Kuponun yalnızca yetkili işletme tarafından ve bir kez kullanılması
- Zincir işlemi kesinleşmeden off-chain kaydın aktifleşmemesi

## Depo yapısı

```text
apps/web/          Next.js müşteri vitrini
services/api/      FastAPI ve PostgreSQL servisi
programs/          Anchor programı için sözleşme alanı
docs/              Mimari kararlar ve teslim planı
```

## Yerel geliştirme

Gereksinimler: Docker Desktop ve Node.js 20.9+.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Servisler:

- Web: http://localhost:3000
- Müşteri paneli: http://localhost:3000/musteri
- İşletme paneli: http://localhost:3000/isletme
- API: http://localhost:8000
- API dokümantasyonu: http://localhost:8000/docs
- PostgreSQL: localhost:5432

Yalnızca API alan testlerini çalıştırmak için Python 3.13 ortamında:

```powershell
cd services/api
python -m pip install -e ".[dev]"
python -m pytest
```

Yerel Python 3.14 desteklenir; tekrarlanabilir geliştirme ve CI ortamı için Docker imajı Python 3.13 kullanır.


## Güvenlik sınırı

Validex hiçbir kullanıcı veya işletme private key/seed phrase bilgisini almaz. API yüksek entropili kupon sırrını şifreli saklar; zincire yalnızca SHA-256 özeti yazılır. QR, zincirdeki kupon adresini taşır. Kullanım için müşteri ve işletme cüzdanlarının ikisi de aynı işlemi imzalar; sır zincire açıklanmaz.

## Zincir ödeme akışı

Kampanya listesi ve cüzdana ait kuponlar API/PostgreSQL'den yüklenir; `localStorage` bu kayıtlar için kullanılmaz. İşletme kampanyayı cüzdanıyla zincirde oluşturup API'ye doğrulatır. Müşteri `purchase-intent` API'sinden bekleyen kuponu alır, sonra Solflare/Phantom ile USDC'yi kampanya escrow kasasına gönderir. Kupon yalnızca zincir hesabı ve işlem imzası `finalized` düzeyinde doğrulanıp API kaydı aktifleşince kullanılabilir. Sayfa kapanırsa bekleyen kuponun zincir durumu tekrar kontrol edilerek API kaydı kurtarılır; ödeme otomatik olarak yeniden gönderilmez. Devnet kurulumu tamamlanana kadar zincir işlem düğmeleri kapalıdır.

İşlem takipçisi `getSignatureStatuses` ile `pending`/`confirmed`/`finalized`/`failed` durumlarını okur. Kimlik doğrulanmış kullanıcı `GET /api/v1/transactions/{signature}/status` adresinden ağ durumunu sorgulayabilir. Finansal kayıtlar yalnızca `finalized` işlem gövdesi (`getTransaction`) beklenen Validex talimatı, imzalayanlar, hesaplar, USDC mint'i, token programı ve tam transfer tutarıyla eşleşirse güncellenir. İşlem imzaları PostgreSQL'de benzersizdir; aynı imza farklı kupon veya kampanya için kullanılamaz. Bu doğrulama RPC kanıtına dayanır; gerçek devnet testi, program ve mint adresleri girilmeden yapılamaz.

## Cüzdanla giriş

Paneldeki Solflare ve Phantom bağlantıları artık adres sahipliğini mesaj imzasıyla doğrular. Solflare, Colosseum demosu için birincil cüzdandır:

1. `POST /api/v1/auth/challenge` tek kullanımlık, beş dakika geçerli mesaj üretir.
2. Seçilen Solana cüzdanı mesajı Ed25519 ile imzalar; bu işlem transfer veya ağ ücreti oluşturmaz.
3. `POST /api/v1/auth/verify` imzayı Solana public key'iyle doğrular.
4. Başarılı girişte 15 dakikalık erişim tokenı verilir ve challenge tekrar kullanılamaz.
5. `GET /api/v1/auth/me` tokenın bağlı olduğu kullanıcı ve rolü döndürür.

Erişim tokenı tarayıcı sekmesine özel `sessionStorage` içinde tutulur. Gerçek kampanya oluşturma API'si yalnızca `merchant` rolüne ve ilgili işletme kaydının sahibi olan cüzdana açıktır.

Yerel API çalışırken uçtan uca kimlik duman testini çalıştırmak için:

```powershell
python services/api/scripts/smoke_auth.py
```

## Colosseum demo akışları

- `/kampanyalar/[id]`: kampanya detayı, kapasite ve satın alma geri bildirimi
- `/musteri/kuponlar/[id]`: cüzdana özel tek kullanımlık QR kuponu
- `/isletme/kampanyalar/[id]`: satış, kullanım ve paylaşım yönetimi
- `/isletme/kampanyalar/[id]/tara`: kamera veya yedek kod ile kupon doğrulama

Web doğrulamasının tamamını tek komutla çalıştırmak için:

```powershell
cd apps/web
npm run verify
```

Uygulama ağı `NEXT_PUBLIC_SOLANA_RPC_URL` üzerinden Solana Devnet olarak sabitlenir. Gerçek işlem kodu eklendi, ancak yönetici adresi ve devnet USDC mint adresi henüz verilmediği ve Anchor programı dağıtılmadığı için ödeme düğmeleri kapalıdır. Freighter, Stellar WalletConnect, Horizon, trustline, XLM ve no-show sözleşmeleri Validex mimarisinin parçası değildir.

Dağıtımdan sonra aynı program ID, RPC ve mint değerlerini web (`NEXT_PUBLIC_VALIDEX_PROGRAM_ID`, `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_USDC_MINT`) ve API (`VALIDEX_SOLANA_PROGRAM_ID`, `VALIDEX_SOLANA_RPC_URL`, `VALIDEX_USDC_MINT`) ortamlarına yazın. İşletme başvurusu yönetici cüzdanıyla zincirde kaydedilir; işletme kampanyayı zincirde yayımlar, müşteri USDC'yi escrow'a gönderir. Kupon kullanımında işletme imzalı işlem metnini müşteriye iletir; müşteri ikinci imzayla işlemi tamamlar. Escrow aynı atomik işlemde işletmeye `%98`, platforma `%2` öder. Kampanya iptalinde veya son kullanım zamanında kullanılmamış kupon sahibi tam tutarlı iadeyi kendi cüzdanıyla talep eder; otomatik transfer yapılmaz. İptal zincirde kesinleşip API kaydı gecikirse işletme, saklanan işlem imzasıyla yalnızca API doğrulamasını yeniden dener. Zincir onayı belirsizse yeniden ödeme/iade göndermeden önce kupon durumunu kontrol edin.

## İşletme ve yönetici akışı

İşletme cüzdanı `/isletme` ekranından başvuru oluşturur. Başvuru kişisel işletme bilgilerini zincire yazmadan PostgreSQL'de `pending` durumunda saklar. `VALIDEX_ADMIN_WALLETS` içinde tanımlı bir cüzdan `/yonetim` ekranından başvuruyu onayladığında kullanıcı `merchant` rolüne geçirilir. Rol değişikliğinden sonra yeni yetkiyi içeren oturum için cüzdan bağlantısı yenilenmelidir.

```env
VALIDEX_ADMIN_WALLETS=["YONETICI_SOLANA_CUZDAN_ADRESI"]
```

Kupon satın alma hazırlığı `POST /api/v1/vouchers/purchase-intent` ile 256-bit rastgele bir sır üretir. Sırrın SHA-256 özeti zincir işlemi için döndürülür; asıl sır sunucuda şifreli saklanır ve kupon `pending_chain` durumunda kalır. Anchor işlemi kesinleşmeden kupon aktif olmaz.
