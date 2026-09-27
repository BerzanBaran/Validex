# MVP teslim planı

## M1 — Temel (mevcut)

- Monorepo, geliştirme ortamı ve sağlık kontrolleri
- PostgreSQL çekirdek veri modeli
- Kampanya listeleme/oluşturma API'si
- Saf alan kuralları: komisyon, hash, satın alma ve kullanım kontrolleri
- İlk müşteri vitrini

## M2 — Cüzdan kimliği (devam ediyor)

- [x] Tek kullanımlık ve kısa ömürlü nonce
- [x] Solflare ve Phantom ile mesaj imzalama
- [x] Ed25519 doğrulama ve kısa ömürlü erişim tokenı
- [x] Merchant rolüyle kampanya oluşturma koruması
- [x] İşletme başvurusu ve yönetici onay akışı
- [x] Yönetici işletme onay endpoint'leri ve rol koruması
- [ ] Ayrıntılı yönetici rol matrisi

## M2.5 — Colosseum ürün demosu (mevcut)

- [x] Kampanya ayrıntı ve kapasite görünümü
- [x] Cüzdana özel QR kupon ekranı
- [x] İşletme kampanya yönetimi ve paylaşımı
- [x] Kamera/yedek kod ile tek kullanımlık kupon doğrulama
- [x] Solana Devnet RPC üzerinden SOL ve yapılandırılmış USDC bakiye okuma
- [x] Ön yüz tip kontrolü, QR testleri ve tek komutluk doğrulama

## M3 — Anchor escrow programı

- Platform, merchant, campaign, buyer-counter ve voucher PDA'ları
- Test SPL mint ile satın alma/escrow
- Kullanımda %2 komisyon ve ödeme
- İptal/iade yolları ve kapsamlı Anchor testleri

## M4 — Zincir entegrasyonu

- [x] Şifreli kupon sırrı ve `pending_chain` satın alma intent'i
- [ ] Anchor satın alma işlemi oluşturma
- RPC kesinlik takipçisi ve idempotent webhook/worker
- QR üretimi, tarama ve iki katmanlı kullanım doğrulaması

## M5 — Operasyon

- İşletme başvurusu ve manuel yönetici onayı
- Satış/gelir raporu, denetim kayıtları ve rate limiting
- Tehdit modellemesi, yük testleri ve devnet uçtan uca test
