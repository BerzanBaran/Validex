# Validex API

FastAPI tabanlı off-chain indeks ve iş akışı servisi. Ödeme yetkisi veya kullanıcı private key'i tutmaz.

Zincir işlem takipçisi `GET /api/v1/transactions/{signature}/status` ile imzanın ağdaki `pending`, `confirmed`, `finalized` veya `failed` durumunu döndürür. Kupon ve kampanya onay uçları yalnızca `finalized` düzeyinde başarılı işlemleri kaydeder; RPC işlemindeki Validex talimatını, imzacıları, hesapları ve varsa USDC transferlerini doğrular. Aynı imza farklı bir işlem kaydında tekrar kullanılamaz.

