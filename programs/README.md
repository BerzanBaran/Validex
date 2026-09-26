# Solana program alanı

Anchor programı M3'te burada oluşturulacaktır. Yerel ortamda `rustc`, Solana CLI ve Anchor CLI henüz bulunmadığından derlenemeyen örnek sözleşme kodu eklenmedi.

Planlanan PDA'lar:

- `platform` → `[b"platform"]`
- `merchant` → `[b"merchant", merchant_wallet]`
- `campaign` → `[b"campaign", merchant, campaign_id]`
- `buyer_counter` → `[b"buyer", campaign, buyer]`
- `voucher` → `[b"voucher", campaign, voucher_hash]`
- escrow authority → `[b"escrow", campaign]`

Program uygulanırken Token Interface kullanılacak ve kabul edilen mint platform hesabına sabitlenecektir.

