# Börekçi

Garson tableti, kasa ve menü ayarı. Garson ürüne basınca adisyon oluşur. Kasa, hangi masada ne durduğunu aynı anda görür.

![Sipariş tezgahı](ekran/ana.png)

![Garson](ekran/garson.png)

![Kasa](ekran/kasa.png)

![Menü ve masa ayarı](ekran/ayar.png)

## Kurulum

Ek paket yok. Node yeter.

```bash
cd borekci
node server.js
```

Adres: http://127.0.0.1:4173

- `/` tezgah
- `/garson` tablet
- `/kasa` açık masalar
- `/ayar` masa sayısı ve menü

`PORT` ortam değişkeni portu değiştirir.

## Nasıl kuruldu

Sunucu, çatısız **Node.js `http`** modülü. Sayfalar `public/` altında düz HTML, CSS ve JavaScript. Menü `data/menu.json`, günün masaları `data/state.json` dosyasında. Garson ile kasa **Server-Sent Events** (`text/event-stream`) ile bağlı kalır; biri yazınca diğeri yenilenir. Gün anahtarı `Europe/Istanbul` saatine göre değişir.
