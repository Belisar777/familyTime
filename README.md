# FamilyTimes

Rodinný organizační systém postavený pouze na Node.js, JavaScriptu, HTML a CSS. Nevyžaduje žádné externí balíčky.

## Funkce

- denní a měsíční rodinný kalendář,
- úkoly, odpovědnosti a filtrování,
- opakované aktivity a připomínky,
- profily členů a barevné rozlišení,
- účty, oddělené domácnosti a jednorázové pozvánky,
- role správce a člena s kontrolou oprávnění na serveru,
- serverová synchronizace a offline lokální kopie,
- odběrový iCalendar kanál pro Google, Apple a Outlook,
- denní, týdenní a osobní tiskové sestavy,
- export a validovaný import záloh,
- instalovatelná PWA s offline aplikačním rozhraním.

## Spuštění

Požadován je Node.js 18 nebo novější.

```bash
npm start
```

Aplikace bude dostupná na `http://localhost:3000`. Při prvním otevření vytvořte správce a domácnost. Výchozí port lze změnit proměnnou `PORT`.

## Data a konfigurace

Provozní soubory vznikají v adresáři `data/`, který není verzovaný:

- `auth.json` obsahuje účty, domácnosti a pozvánky,
- `households/*.json` obsahují data jednotlivých domácností,
- `.session-secret` slouží k podepisování relací.

Jiný datový adresář lze nastavit přes `FAMILYTIMES_DATA_DIR`. V produkci doporučujeme nastavit stabilní dlouhou hodnotu `SESSION_SECRET` a aplikaci provozovat za HTTPS reverse proxy. Cookie se v režimu `NODE_ENV=production` automaticky označí jako `Secure`.

## Testy

```bash
npm run check
npm test
```

Integrační test používá pouze dočasné úložiště a náhodný lokální port. Ověřuje ochranu API, registraci, heslo, relaci, pozvánku, role, zápis dat a iCalendar kanál.

## Kalendáře

Odběrový odkaz je dostupný v Nastavení. Obsahuje náhodný tajný token domácnosti, proto jej sdílejte pouze s jejími členy. Jde o jednosměrný standardní iCalendar odběr; četnost aktualizací určuje Google, Apple nebo Microsoft.

## Zálohování

V Nastavení lze stáhnout kompletní JSON zálohu a později ji obnovit. Importovaný soubor je před použitím validován. Pro serverové nasazení zároveň pravidelně zálohujte celý datový adresář.

## Produkční poznámka

Vestavěné JSON úložiště je vhodné pro jednu rodinu nebo menší soukromou instalaci. Veřejná služba s vysokým počtem souběžných domácností by měla použít transakční databázi, e-mailové doručování pozvánek a OAuth integrace pro plnou obousměrnou synchronizaci kalendářů.
