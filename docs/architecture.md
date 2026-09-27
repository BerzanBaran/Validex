# MVP mimarisi

## Güven sınırları

```text
Solflare / Phantom cüzdanı
      │ imzalı işlem / imzalı oturum mesajı
      ▼
Next.js ───────► FastAPI ───────► PostgreSQL
   │                │                 │
   │ işlem oluştur  │ doğrulama/izleme│ PII + şifreli sır
   ▼                ▼                 │
Solana RPC ◄──── Anchor programı ◄────┘ hash ve adres eşleme
```

- Cüzdan anahtarları yalnızca kullanıcının Solflare veya Phantom cüzdanındadır.
- PostgreSQL keşif, raporlama ve şifreli kupon sırrı için kullanılır; ödeme gerçeğinin kaynağı değildir.
- Solana programı sahiplik, stok, escrow ve tek kullanımlık durumu için nihai kaynaktır.
- API, `confirmed/finalized` zincir sonucu gelmeden kuponu `active` yapmaz.

## Satın alma atomikliği

1. API rastgele kupon sırrı üretir ve yalnızca hash'i işlem parametresine koyar.
2. İstemci `purchase_voucher` işlemini bağlı Solana cüzdanıyla imzalar.
3. Program stok ve limitleri kontrol ederek USDC'yi kampanya escrow ATA'sına taşır.
4. İzleme servisi işlemi doğrular; program ID, hesap adresleri, mint, miktar ve kupon hash'i beklenen değerlerle eşleşmelidir.
5. Eşleşme ve yeterli kesinlikten sonra off-chain kupon `active` olur.

## Kullanım atomikliği

1. İşletme paneli QR sırrını API'ye gönderir.
2. API hash'i hesaplar, aktif kuponu ve işletme yetkisini bulur.
3. İşletme `redeem_voucher` işlemini imzalar.
4. Program kupon durumunu atomik olarak `redeemed` yapar; escrow'dan komisyonu treasury'ye, kalanı işletmeye yollar.
5. API kesinleşmiş işlemi doğrulayıp raporlama kaydını günceller.

## Para hesabı

Tüm tutarlar USDC'nin en küçük birimi olan tamsayılarla tutulur. Komisyon baz puandır (`200 bps = %2`):

```text
commission = floor(gross_amount * commission_bps / 10_000)
merchant   = gross_amount - commission
```

Kayan noktalı sayı ödeme yolunda kullanılmaz.
