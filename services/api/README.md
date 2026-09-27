# Validex API

FastAPI tabanlı off-chain indeks ve iş akışı servisi. Ödeme yetkisi veya kullanıcı private key'i tutmaz.

Zincir işlem takipçisi `GET /api/v1/transactions/{signature}/status` ile imzanın ağdaki `pending`, `confirmed`, `finalized` veya `failed` durumunu döndürür. Kupon ve kampanya onay uçları yalnızca `finalized` düzeyinde başarılı işlemleri kaydeder; RPC işlemindeki Validex talimatını, imzacıları, hesapları ve varsa USDC transferlerini doğrular. Aynı imza farklı bir işlem kaydında tekrar kullanılamaz.

Kupon yanıtındaki `campaign_cancelled` alanı müşteri arayüzüne iade hakkını gösterir. İade uygunluğunun nihai kararı sözleşmededir: kullanılmamış kupon, kampanya iptal edilince veya son kullanım zamanına ulaşınca sahibi tarafından tam tutarla escrow'dan geri alınabilir. `POST /api/v1/vouchers/{id}/refund-confirm`, tamamlanmış zincir işlemini ve USDC transferini doğrulamadan PostgreSQL durumunu `refunded` yapmaz. Süresi dolmuş kupon veritabanında `active` kalabilir; bu, iade talebi yapılabilmesi içindir.

`VALIDEX_ADMIN_WALLET` yalnızca Solana public key kabul eder; boşsa yönetici API'si kapalıdır. Yönetici yetkisi her istekte bu adresle tekrar eşleştirilir. `POST /api/v1/vouchers/scan` yalnızca doğrulanmış işletme sahibi veya aktif QR çalışanı tarafından çağrılabilir; PostgreSQL sahiplik/durum/süre koşullarını ve Solana kupon/kampanya hesabını birlikte kontrol eder. Başarısız/yetkisiz taramalar `security.*` denetim olaylarına yazılır. Yönetici `GET /api/v1/admin/audit?suspicious_only=true` ile bunları görebilir. İşletme çalışanlarına ödeme imzası yetkisi verilmez.

Rate limit, uygulama süreci başına sabit 60 saniyelik penceredir: giriş challenge/verify uçları 10, QR tarama 30, diğer API uçları 120 istek/IP. `X-Forwarded-For` güvenilmez kabul edilir. Çoklu API kopyası için Redis veya paylaşımlı limit deposu gereklidir. Mevcut PostgreSQL kurulumuna çalışan tablosunu eklemek için `migrations/001_merchant_staff.sql` çalıştırın; geliştirme ortamında `VALIDEX_AUTO_CREATE_SCHEMA=true` tabloyu oluşturur.

