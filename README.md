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

Validex hiçbir kullanıcı veya işletme private key/seed phrase bilgisini almaz. QR içeriğinde yalnızca yüksek entropili, tek kullanımlık bir sır taşınır; zincire bunun SHA-256 özeti yazılır.

## Arayüz demo akışı

İşletme panelinden oluşturulan kampanyalar tarayıcının yerel deposuna kaydedilir ve müşteri panelinde hemen görünür. Müşteri panelindeki demo satın alma stok düşürür ve kuponu ilgili cüzdanın “Kuponlarım” alanına ekler. Bu akış ürün arayüzünü doğrulamak içindir; Anchor escrow programı tamamlanana kadar gerçek USDC transferi yapmaz.

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

Uygulama ağı `NEXT_PUBLIC_SOLANA_RPC_URL` üzerinden Solana Devnet olarak sabitlenir. Demo USDC mint adresi `NEXT_PUBLIC_USDC_MINT` ile verilir. Freighter, Stellar WalletConnect, Horizon, trustline, XLM ve no-show sözleşmeleri Validex mimarisinin parçası değildir.

## İşletme ve yönetici akışı

İşletme cüzdanı `/isletme` ekranından başvuru oluşturur. Başvuru kişisel işletme bilgilerini zincire yazmadan PostgreSQL'de `pending` durumunda saklar. `VALIDEX_ADMIN_WALLETS` içinde tanımlı bir cüzdan `/yonetim` ekranından başvuruyu onayladığında kullanıcı `merchant` rolüne geçirilir. Rol değişikliğinden sonra yeni yetkiyi içeren oturum için cüzdan bağlantısı yenilenmelidir.

```env
VALIDEX_ADMIN_WALLETS=["YONETICI_SOLANA_CUZDAN_ADRESI"]
```

Kupon satın alma hazırlığı `POST /api/v1/vouchers/purchase-intent` ile 256-bit rastgele bir sır üretir. Sırrın SHA-256 özeti zincir işlemi için döndürülür; asıl sır sunucuda şifreli saklanır ve kupon `pending_chain` durumunda kalır. Anchor işlemi kesinleşmeden kupon aktif olmaz.
