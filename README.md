# Woolf automatski cjenik

Automatski cjenik za woolf.hr spojen iz Jeftinije XML i Google CSV feeda.

- dnevna serverska sinkronizacija
- Jeftinije je glavni izvor za artikle i varijante
- Google dopunjava samo glavne šifre kojih nema u Jeftinije feedu; one se označavaju kao nedostupne
- 1 red po glavnom proizvodu, sa spojenim veličinama i varijantama
- pretraga, filtri, sortiranje i mobilni prikaz
- CSV datoteka za preuzimanje
- zaštita od objave praznog ili neispravnog feeda
- dnevna arhiva podataka u povijesti repozitorija
- ERP barkodovi po kombinaciji glavna šifra + veličina (`config/erp-barkodovi.csv`)
- sidrene cijene za 924 akcijska artikla ispravljene na tadašnju akcijsku/maloprodajnu cijenu

Za postavljanje slijedi datoteku [UPUTE_KORAK_PO_KORAK.md](UPUTE_KORAK_PO_KORAK.md).


## Brendovi iz čistog webshop exporta

- `config/brendovi.csv` sadrži samo sigurna povezivanja **točna šifra artikla → brend** iz kompletnog webshop exporta (aktivni i nedostupni artikli).
- Jeftinije feed i dalje je glavni izvor brenda. Ako Jeftinije već pošalje brend, on se koristi.
- Mapping se koristi samo kao fallback kada je brend u feedu prazan, posebno za stare/nedostupne Google-only artikle.
- Artikli bez sigurnog brenda ostaju prazni; brend se ne pogađa iz naziva.
- Trenutni mapping sadrži 12.294 sigurne šifre; 176 artikala iz webshop exporta nema dodijeljen brend i namjerno ih ne pogađamo.
