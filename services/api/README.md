# Validex API

FastAPI tabanlı off-chain indeks ve iş akışı servisi. Ödeme yetkisi veya kullanıcı private key'i tutmaz.

Zincir işlem takipçisi `GET /api/v1/transactions/{signature}/status` ile imzanın ağdaki `pending`, `confirmed`, `finalized` veya `failed` durumunu döndürür. Kupon ve kampanya onay uçları yalnızca `finalized` düzeyinde başarılı işlemleri kaydeder; RPC işlemindeki Validex talimatını, imzacıları, hesapları ve varsa USDC transferlerini doğrular. Aynı imza farklı bir işlem kaydında tekrar kullanılamaz.

Kupon yanıtındaki `campaign_cancelled` alanı müşteri arayüzüne iade hakkını gösterir. İade uygunluğunun nihai kararı sözleşmededir: kullanılmamış kupon, kampanya iptal edilince veya son kullanım zamanına ulaşınca sahibi tarafından tam tutarla escrow'dan geri alınabilir. `POST /api/v1/vouchers/{id}/refund-confirm`, tamamlanmış zincir işlemini ve USDC transferini doğrulamadan PostgreSQL durumunu `refunded` yapmaz. Süresi dolmuş kupon veritabanında `active` kalabilir; bu, iade talebi yapılabilmesi içindir.

