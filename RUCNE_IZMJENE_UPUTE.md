# Ručne izmjene cjenika

Datoteka `config/rucne-izmjene.csv` služi samo za iznimke. Svaki red mora imati šifru proizvoda, a ostala polja mogu ostati prazna.

Stupci su odvojeni znakom `;`:

- `Sifra` – obvezno, mora odgovarati šifri iz feeda
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
