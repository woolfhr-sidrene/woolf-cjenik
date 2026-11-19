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

Za postavljanje slijedi datoteku [UPUTE_KORAK_PO_KORAK.md](UPUTE_KORAK_PO_KORAK.md).


## Brendovi iz čistog webshop exporta

- `config/brendovi.csv` sadrži samo sigurna povezivanja **točna šifra artikla → brend** iz kompletnog webshop exporta (aktivni i nedostupni artikli).
- Jeftinije feed i dalje je glavni izvor brenda. Ako Jeftinije već pošalje brend, on se koristi.
- Mapping se koristi samo kao fallback kada je brend u feedu prazan, posebno za stare/nedostupne Google-only artikle.
- Artikli bez sigurnog brenda ostaju prazni; brend se ne pogađa iz naziva.
- Trenutni mapping sadrži 12.294 sigurne šifre; 176 artikala iz webshop exporta nema dodijeljen brend i namjerno ih ne pogađamo.


## Oblik cjenika od 17. 11. 2026. (Pravilnik o načinu objave cjenika proizvoda, NN 132/2026)

- Prvi redak CSV-a su nazivi stupaca. Prvih 11 stupaca ide točno redom iz čl. 3. st. 2.: Naziv proizvoda, Šifra, Marka, Neto količina, Jedinica mjere, Maloprodajna cijena, Poseban oblik prodaje, Cijena za jedinicu mjere, Barkod, EAN barkod, Bazna cijena. Iza njih su dodatni stupci (datum bazne cijene, naziv akcije, redovna cijena, dostupnost, varijante, kategorija, poveznica).
- Naziv datoteke: `OIB_Webshop_Ograda-14-Vratisinec_160_ROBA_<broj pohrane>_<GGGGMMDD>_<SSMM>.csv` (i `.xml`).
- UTF-8, stupci odvojeni znakom `;`. Arhiva se čuva 30 dana (propisano je najmanje 15).
- Bazna cijena novog artikla je redovna cijena na dan kad je ušao u ponudu, nikad akcijska.
- `products.json` i datoteke u `config/` imaju isti oblik kao prije (koriste ih dorade i Chrome ekstenzija za sidrene cijene).

## Kada se cjenik objavljuje

- Glavni okidač je cron na cPanelu (woolfshopsi) u 7:00, s rezervama u 8:30 i 10:00; pokreće workflow s `samo_ako_nema=true`, pa se drugi put isti dan ne izrađuje novi cjenik. Ako cjenika nema ni u 10:20, šalje se e-mail.
- Zakazano GitHub pokretanje ostaje samo kao zadnja rezerva (GitHub ga zna odgoditi i po nekoliko sati) i preskače se ako je današnji cjenik već objavljen.
- Ručno pokretanje (Actions → Sinkroniziraj i objavi cjenik → Run workflow) uvijek izradi novi cjenik.

## Ispravak baznih cijena 19. 11. 2026.

Po Pravilniku o isticanju bazne cijene (NN 132/2026, čl. 3. st. 4. i 5.) bazna cijena artikla koji je na referentni dan bio na akciji je redovna cijena prije akcije, nikad akcijska. Ispravljeno je 11 artikala (isto i u Marker adminu, uvozi sidrenih cijena #95 i #98):

- 9 Smartus artikala bilo je 10. 9. 2026. na rujanskoj akciji (ručno postavljenoj 31. 8. – 28. 9.), pa je „ispravak 924” kao sidro uzeo akcijsku cijenu: sm-001525 1099, sm-372191 229, sm-001445 499, sm-001338 879, sm-001497 299, sm-001545 499, sm-001546 2999, sm-001086 399, sm-001412 249 (`config/sidrene-cijene.csv`)
- 9999003_PAW_PATROL 17,12 (26. 10. 2026.) i 6500944BB 899,00 (10. 11. 2026.) – u ponudu su ušli sniženi (`config/rucne-izmjene.csv`)

Datoteke ISPRAVAK_924_* opisuju stari, sada nevažeći pristup.
