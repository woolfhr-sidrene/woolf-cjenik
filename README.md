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
