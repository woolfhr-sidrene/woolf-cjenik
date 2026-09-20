# Ispravak 924 sidrene cijene

Ispravljeno je točno 924 sidrene cijene koje su u prethodnoj verziji bile postavljene na redovne cijene. Za te artikle sada se kao cijena na dan 10. 09. 2026. koristi akcijska/maloprodajna cijena iz sačuvanog Jeftinije snapshota. Ostale sidrene cijene i ručne izmjene nisu mijenjane. Ručna iznimka 6500944_21 ostaje 599 EUR.

Ispravak je zaključan u `config/sidrene-cijene.csv`, pa ga dnevna sinkronizacija ne mijenja kada se promijene današnje cijene u feedu.

## ERP barkodovi

Dodana je datoteka `config/erp-barkodovi.csv`. Barkod se veže uz kombinaciju **glavna šifra + veličina**. Time jedna glavna šifra može imati različit barkod za 36, 37, 38 itd. Ako ERP za istu šifru i veličinu sadrži više različitih barkodova, taj par se namjerno ne upisuje automatski.

Za postavljanje prenesite cijeli sadržaj ovog paketa na postojeći GitHub repozitorij (ili najmanje `config/sidrene-cijene.csv`, `config/erp-barkodovi.csv` i `scripts/sync.mjs`) i zatim pokrenite **Actions → Sinkroniziraj i objavi cjenik → Run workflow**.
