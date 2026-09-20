# Ručne izmjene cjenika

Datoteka `config/rucne-izmjene.csv` služi samo za iznimke. Svaki red mora imati šifru proizvoda, a ostala polja mogu ostati prazna.

Stupci su odvojeni znakom `;`:

- `Sifra` – obvezno; može biti osnovna šifra proizvoda (vrijedi za sve veličine) ili puna šifra varijante iz dnevnog cjenika
- `SidrenaCijena` – ručno ispravljena sidrena cijena
- `NazivAkcije` – naziv posebnog oblika prodaje; ako je prazno, sustav koristi „Akcija” kada je aktualna cijena niža od redovne
- `Barkod` – koristi se kada ga feed nema ili ga treba ispraviti
- `JedinicaMjere` – zadano je `kom`
- `CijenaPoJedinici` – zadano je jednako aktualnoj cijeni

Primjer:

```csv
Sifra;SidrenaCijena;NazivAkcije;Barkod;JedinicaMjere;CijenaPoJedinici
6500944_21;599.00;;;;
```

Za novu iznimku dodajte novi red i spremite promjenu. Ne mijenjajte datoteku `config/sidrene-cijene.csv` osim ako namjerno ispravljate početnu snimku cijena od 10. 9. 2026.

Ako feed nema barkod, cjenik automatski prikazuje `Nije dodijeljen`, a šifra artikla ostaje glavni identifikator. Barkod se ručno dopunjava samo ako stvarno postoji, ali ga feed ne isporučuje. Za različite barkodove po veličinama unesite po jedan red za svaku punu šifru varijante.
