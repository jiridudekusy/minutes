# Zmínky uživatelů přes MCP

`send_message` přijímá volitelný parametr `mentions`. Ve skupinách Group V2
vytvoří skutečnou Signal zmínku konkrétního člena. Samotný text `@jméno`
bez tohoto parametru zůstává obyčejným textem.

Nejdřív načtěte členy přes `get_group` a použijte přesné `id` daného člena
jako `contactId`. Lze použít také ID z `list_contacts`,
ale označený kontakt musí být aktuálním členem cílové skupiny. Nemusí být
uložený v adresáři; stačí jeho profil známý z dané skupiny.

Příklad argumentů `send_message`:

```json
{
  "conversationId": "ID-skupiny",
  "text": "Ahoj @Tomáš, kdy můžeš?",
  "mentions": [{ "contactId": "ID-Tomáše", "start": 5, "length": 6 }],
  "idempotencyKey": "domluva-call-2026-10-14-tomas"
}
```

`start` je pozice od nuly v původním `text`, `length` je délka nahrazovaného
úseku. Obě hodnoty se počítají v UTF-16 jednotkách (jako JavaScript
`string.length`; většina emoji zabírá dvě jednotky). Minutes úsek nahradí
Signal zástupným znakem a připojí identitu kontaktu; zobrazované jméno
pak určí Signal.

Lze označit více lidí i stejnou osobu vícekrát, nejvýše 100 zmínek v jedné
zprávě. Pořadí položek není důležité. Úseky se nesmějí překrývat, přesáhnout
text ani rozdělit Unicode surrogate pair. Neplatný požadavek se odmítne
před vložením zprávy do odesílací fronty. Zmínky vyžadují `text` a skupinu
Group V2; v přímých konverzacích nejsou podporované.

Při použití neprázdného `mentions` se text odesílá doslova včetně mezer,
bez převodu Markdownu, aby se pozice neposouvaly. Přílohy lze připojit
ve stejném požadavku. Bez zmínek zůstává dosavadní chování odesílání.

Při opakování stejného požadavku použijte stejný `idempotencyKey` i stejné
`mentions`. Změna zmíněného kontaktu se stejným klíčem vrátí
`IDEMPOTENCY_CONFLICT` stejně jako změna textu nebo příloh.

`edit_message` přijímá stejné `mentions`. Při úpravě předejte kompletní nový
text a všechny požadované zmínky; původní text i jeho zmínky se nahrazují.
Podrobnosti jsou v [MCP-MESSAGE-MUTATIONS.md](MCP-MESSAGE-MUTATIONS.md).
