# Ispravak sidrenih cijena i ERP barkodovi

## Sidrene cijene

Ispravljeno je **924** proizvoda koji su u ranijoj verziji dobili redovnu cijenu kao sidrenu. iako su u korištenom snapshotu Jeftinije cjenika bili na akciji. Za tih 924 šifre sidrena cijena sada je vraćena na tada prikazanu akcijsku/maloprodajnu cijenu.

Ručna iznimka **6500944_21** ostaje nepromijenjena: sidrena cijena **599.00 EUR**.

## ERP barkodovi

Iz ERP ispisa `lista.pdf` preuzeti su barkodovi po kombinaciji **naša šifra + veličina**. U konfiguraciju je upisano **6.122** jednoznačnih kombinacija šifra/veličina za artikle koji postoje u Jeftinije tablici.

- Jeftinije glavne šifre u snapshotu: 1.344
- Glavne šifre za koje ERP daje barem jedan jednoznačan barkod: 982
- Veličine u snapshotu Jeftinije: 2.636
- Veličine s jednoznačnim ERP barkodom: 2.149
- Pokrivenost veličina: 81.5%
- Dvosmislene kombinacije šifra/veličina preskočene: 21
- Retci ERP ispisa koji zbog složenog prijeloma nisu automatski protumačeni: 35

Kod dvosmislenih zapisa barkod nije nasumično odabran. Oni ostaju na postojećem feed EAN-u ili `Nije dodijeljen` dok se ne potvrdi koji je barkod važeći.
