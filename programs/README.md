# Validex Anchor programı

`programs/validex` Solana üzerinde tek mint ile çalışan USDC kupon escrow sözleşmesidir. Anchor `1.2.0` kullanır. Program kimliği kaynak kodda geçici olarak tanımlıdır; devnet dağıtımından önce gerçek program anahtarı oluşturulup `anchor keys sync` ile eşitlenmelidir.

`ADMIN_PUBKEY` şimdilik sıfır adrestir: gerçek yönetici açık adresi belirlenene kadar `initialize_platform` güvenli biçimde başarısız olur. Dağıtımdan önce `src/lib.rs` içindeki sabit gerçek yönetici adresiyle değiştirilmelidir.

## Hesaplar

| Hesap | PDA seed'leri | Görevi |
| --- | --- | --- |
| Platform | `platform` | Yönetici, treasury, ödeme mint'i, token programı ve sabit `%2` komisyon |
| Merchant | `merchant`, işletme cüzdanı | Yönetici tarafından zincirde doğrulanmış işletme |
| Campaign | `campaign`, Merchant PDA, `campaign_id` little-endian `u64` | Fiyat, stok, tarih, limit ve iptal durumu |
| BuyerCounter | `buyer`, Campaign PDA, müşteri cüzdanı | Müşteri başına satın alma sınırı |
| Voucher | `voucher`, Campaign PDA, 32 bayt kupon hash'i | Tekil kupon, sahibi, tutarı ve kullanım durumu |

Escrow, Campaign PDA'sının ödeme mint'i için associated token hesabıdır. Kampanya oluşturulurken açılır. Satın alma fiyatın tamamını escrow'a aktarır. Hedeflenen kullanım akışında `%2` komisyon treasury token hesabına ve kalan tutar işletme token hesabına aktarılacaktır; bu talimat henüz eklenmedi. İptal edilen kampanyada veya kuponun süresi dolduğunda kullanılmamış kuponun sahibi fiyatın tamamını geri alabilir.

Kupon sırrı API tarafından oluşturulur ve veritabanında şifreli tutulur. Zincirde yalnızca 32 bayt SHA-256 özeti yer alır. Kupon kullanma yetkisi tasarımı kesinleştirildikten sonra `redeem_voucher` talimatı eklenecektir.

## Yerel kontroller

```bash
cargo fmt --all -- --check
cargo test -p validex --lib
anchor build
```

`cargo test` alan kurallarını ve tamsayı komisyon hesabını sınar. Token transferi ve hesap yetkilerinin tamamı ayrıca validator üzerinde entegrasyon testleriyle doğrulanmalıdır.
