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

Escrow, Campaign PDA'sının ödeme mint'i için associated token hesabıdır. Kampanya oluşturulurken açılır. Satın alma fiyatın tamamını escrow'a aktarır. `redeem_voucher`, müşteri ve işletme cüzdanlarının iki imzasını ister; `%2` komisyon treasury token hesabına, kalan tutar işletme token hesabına aynı işlemde aktarılır. İptal edilen kampanyada veya kuponun süresi dolduğunda kullanılmamış kuponun sahibi fiyatın tamamını geri alabilir. SPL token transferlerinden biri başarısızsa tüm Solana işlemi geri alınır.

İade otomatik transfer değildir: kupon sahibi `refund_voucher` işlemini kendi cüzdanıyla imzalar. Kupon, zincirde `Active` olarak kalır fakat iptal veya son kullanım zamanından sonra kullanılamaz; başarılı iade onu `Refunded` yapar. İkinci iade veya kullanılmış kuponun iadesi reddedilir. Kampanya iptali satışları ve kupon kullanımını durdurur, mevcut kullanılmamış kuponlar için anında iade hakkı açar. Escrow'daki tutar yalnızca alıcıya ait USDC token hesabına ve kuponun tam fiyatı kadar aktarılır.

Kupon sırrı API tarafından oluşturulur ve veritabanında şifreli tutulur. Zincirde yalnızca 32 bayt SHA-256 özeti yer alır. Kullanımda sır zincire açıklanmaz; iki taraf aynı işlemi imzalar.

Program henüz dağıtılmadı. Yönetici açık adresi, gerçek program anahtarı ve devnet USDC mint adresi belirlenmeden ödeme arayüzü kapalıdır. `cargo test` validator entegrasyon testi yerine geçmez; devnet kullanımı öncesi SBF derlemesi ve alım/kullanım/iade uçtan uca testleri gerekir.

`initialize_platform` yöneticisi derleme sırasında `VALIDEX_ADMIN_WALLET` ortam değişkeninden programa sabitlenir. Boş veya geçersiz public key ile platform kurulumu reddedilir. `.env` dosyasının varlığı tek başına Anchor derleme ortamına değişkeni aktarmaz; gerçek devnet derlemesinden önce aynı adresi shell ortamında açıkça sağlayın. Private key veya seed phrase kullanmayın.

## Yerel kontroller

```bash
cargo fmt --all -- --check
cargo test -p validex --lib
anchor build
```

`cargo test` alan kurallarını, yanlış mint reddini, iki taraflı kullanım yetkisini, tekrar kullanımı ve tamsayı komisyon hesabını sınar. Token transferi ve Anchor hesap kısıtlarının tamamı ayrıca validator üzerinde entegrasyon testleriyle doğrulanmalıdır. Teslim öncesi kontrol sırası için [hackathon paketine](../docs/hackathon-submission.md) bakın.
