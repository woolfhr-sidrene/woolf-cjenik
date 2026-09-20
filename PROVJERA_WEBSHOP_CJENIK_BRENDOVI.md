# Provjera webshop exporta i cjenika

- Webshop export: **12.470** jedinstvenih šifri.
- Postojeći cjenik: **12.469** jedinstvenih šifri.
- Podudaranje po točnoj šifri: **12.469 / 12.470**.
- Jedini artikl koji postoji u webshop exportu, a nije u cjeniku: `6502156_CS` (`Za pregled (04)`).
- Siguran webshop mapping šifra → brend: **12.294** artikala.
- Nejasnih konflikata šifra → više brendova: **0**.
- U postojećem cjeniku dopunjeno je **11.001** praznih marki; **1.293** su već bile popunjene, bez konflikata.
- Preostalih **175** redaka u cjeniku bez brenda ostavljeno je prazno.

Generator sada: Jeftinije brend ima prednost, a `config/brendovi.csv` služi samo kao fallback za prazne brendove / Google dopunu.

- U kompletnom webshop exportu **176** artikala nema dodijeljen brend; jedan od njih (`6502156_CS`) uopće nije u cjeniku, pa u cjeniku ostaje **175** redaka bez brenda.
