# Woolf cjenik — postavljanje korak po korak

Ovaj paket svaki dan preuzima postojeći Jeftinije XML feed, spaja veličine istog proizvoda, izrađuje javni pretraživi cjenik i CSV datoteku te ih objavljuje preko GitHub Pagesa.

## 1. Otvori GitHub račun

Ako već nemaš GitHub račun, otvori ga na `https://github.com/signup`.

## 2. Napravi novi repozitorij

1. Na GitHubu gore desno klikni znak **+**.
2. Odaberi **New repository**.
3. U polje **Repository name** upiši `woolf-cjenik`.
4. Odaberi **Public**. Podaci u cjeniku ionako su javni, a URL feeda neće biti vidljiv.
5. Nemoj uključivati README, .gitignore ni licencu.
6. Klikni **Create repository**.

## 3. Učitaj sadržaj ZIP-a

1. Raspakiraj ZIP na računalu.
2. U praznom GitHub repozitoriju klikni **uploading an existing file** ili **Add file → Upload files**.
3. U prozor povuci **sav sadržaj** raspakirane mape, uključujući mape `.github`, `docs` i `scripts`.
4. Pri dnu klikni **Commit changes**.

Važno: datoteka `package.json` mora biti odmah na početnoj razini repozitorija, a ne unutar dodatne mape.

Ako Mac ne prikazuje mapu `.github`, u Finderu pritisni `Command + Shift + .` kako bi prikazao skrivene datoteke.

## 4. Spremi URL feeda kao tajni podatak

1. U repozitoriju otvori **Settings**.
2. Lijevo odaberi **Secrets and variables → Actions**.
3. Klikni **New repository secret**.
4. U **Name** upiši točno: `WOOLF_FEED_URL`.
5. U **Secret** zalijepi adresu svojeg Jeftinije XML feeda.
6. Klikni **Add secret**.

Adresa feeda zbog ovoga neće biti vidljiva posjetiteljima ni u javnom kodu.

## 5. Uključi GitHub Pages

1. Otvori **Settings → Pages**.
2. Pod **Build and deployment → Source** odaberi **GitHub Actions**.
3. Vrati se na glavnu stranicu repozitorija.

Zatim otvori **Settings → Actions → General**. Pod **Workflow permissions** odaberi **Read and write permissions** i spremi. To omogućuje spremanje dnevne arhive cjenika.

## 6. Pokreni prvu sinkronizaciju

1. Otvori karticu **Actions**.
2. Lijevo odaberi **Sinkroniziraj i objavi cjenik**.
3. Klikni **Run workflow**, pa ponovno **Run workflow**.
4. Pričekaj da se pojavi zelena kvačica.

Cjenik će zatim biti dostupan na adresi:

`https://TVOJE_GITHUB_IME.github.io/woolf-cjenik/`

Umjesto `TVOJE_GITHUB_IME` upiši svoje GitHub korisničko ime malim slovima.

## 7. Postavi cjenik na woolf.hr

1. Otvori datoteku `CMS-iframe.html` iz paketa.
2. Zamijeni `TVOJE_GITHUB_IME` svojim GitHub korisničkim imenom.
3. Kopiraj cijeli kod.
4. U Woolf administraciji napravi novi statični sadržaj ili stranicu **Cjenik proizvoda**.
5. Prebaci uređivač na HTML prikaz i zalijepi kod.
6. Spremi i provjeri stranicu na računalu i mobitelu.

Ako se na mobitelu unutar cjenika pojave dvije okomite trake za pomicanje, povećaj `height:1100px` na `height:1400px`.

## Automatsko osvježavanje

Sinkronizacija se automatski pokreće svaki dan u 04:30 UTC, odnosno približno u 05:30 po zimskom ili 06:30 po ljetnom hrvatskom vremenu. Feed je pri testiranju već bio osvježen prije tog termina.

Ako preuzimanje ne uspije ili feed odjednom vrati premalo proizvoda, nova verzija se neće objaviti. Posjetiteljima ostaje zadnji ispravan cjenik.

Svaka uspješna sinkronizacija sprema i dnevnu verziju podataka u povijest repozitorija. Tako se može naknadno provjeriti koja je cijena bila objavljena određenog dana.

## Ručno osvježavanje

U bilo kojem trenutku možeš otvoriti **Actions → Sinkroniziraj i objavi cjenik → Run workflow**.

## Provjera rada

Na stranici cjenika provjeri:

- piše li današnji datum zadnjeg ažuriranja
- radi li pretraga po nazivu i šifri
- rade li filtri brenda i kategorije
- otvara li klik na proizvod odgovarajuću Woolf stranicu
- preuzima li gumb **Preuzmi cjenik (CSV)** datoteku

## Što ovaj cjenik prikazuje

- aktualnu cijenu
- redovnu cijenu kada je proizvod snižen
- šifru/model
- brend i kategoriju
- samo trenutačno dostupne veličine
- poveznicu na proizvod

Feed ne sadrži najnižu cijenu u posljednjih 30 dana ni cijenu na dan 10. 9. 2026., pa te dvije vrijednosti nisu dio ovog cjenika.

## Ako Actions pokaže grešku

1. Provjeri postoji li Secret nazvan točno `WOOLF_FEED_URL`.
2. Provjeri otvara li se XML feed u običnom pregledniku.
3. Ako greška spominje `git push` ili dozvole, otvori **Settings → Actions → General**, odaberi **Read and write permissions** i spremi.
4. Ponovno pokreni **Run workflow**.
5. Ako greška ostane, pošalji snimku crvenog koraka iz GitHub Actionsa.
