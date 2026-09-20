# Nadogradnja: Google dopuna nedostupnih proizvoda

## Što se mijenja

- Jeftinije XML ostaje glavni izvor.
- Google CSV dodaje samo glavne šifre kojih nema u Jeftinije feedu.
- Svaki takav Google-only proizvod označen je kao `Nedostupno`.
- Duplikati se ne stvaraju: ako je šifra u oba feeda, koristi se Jeftinije.
- Za Google-only proizvode sidrena cijena 10. 09. 2026. zaključana je iz početne Google cijene (`Price`).
- Stupac `Redovna cijena prije akcije` pokazuje razliku prema trenutačnoj maloprodajnoj cijeni (`Sale price`).
- Ručna iznimka `6500944_21` ostaje sa sidrenom cijenom 599,00 EUR.

## Postavljanje na GitHub

1. Raspakirajte ZIP.
2. U repozitoriju `woolfhr-sidrene/woolf-cjenik` otvorite karticu **Code**.
3. Kliknite **Add file → Upload files**.
4. Prenesite mape `scripts` i `config` iz raspakiranog paketa te potvrdite **Commit changes**.
5. Otvorite `.github/workflows/sync-and-deploy.yml`, kliknite olovku (**Edit**) i njegov sadržaj zamijenite sadržajem priložene datoteke `sync-and-deploy.yml`. Potvrdite **Commit changes**.
6. Otvorite **Actions → Sinkroniziraj i objavi cjenik → Run workflow → Run workflow**.
7. Pričekajte zelenu kvačicu. Očekivani rezultat je 12.469 proizvoda: 1.344 iz Jeftinije feeda i 11.125 nedostupnih iz Google dopune.

Nije potreban novi GitHub Secret. Google feed ima javnu adresu ugrađenu u skriptu. Automatsko pokretanje postavljeno je na 07:40 po ljetnom odnosno 06:40 po zimskom vremenu, nakon osvježavanja feedova u 06:30 i prije roka u 08:00.
