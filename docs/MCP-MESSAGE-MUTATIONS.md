# Úpravy a mazání zpráv přes MCP

`edit_message` i `delete_message` jsou v nastavení MCP v úrovni
**Destruktivní zápis**. Pokud je existující konfigurace nástrojů neobsahuje,
musíte je v nastavení povolit; aktualizace aplikace nerozšiřuje uložený
seznam povolených nástrojů. Po změně znovu načtěte nástroje v MCP klientovi.

Aktuální schopnosti určuje `tools/list`. MCP handshake i `get_server_status`
vracejí skutečnou verzi instalované aplikace.

## Úprava

```json
{
  "conversationId": "ID-skupiny",
  "messageId": "ID-vlastni-zpravy",
  "text": "Ahoj @Tomáš, platí 13:30?",
  "mentions": [{ "contactId": "ID-Tomáše", "start": 5, "length": 6 }],
  "idempotencyKey": "oprava-casu-001"
}
```

Jde o kompletní náhradu textu, nikoli text připojený na konec. Text se
odesílá doslova. Předejte také všechny zmínky požadované v novém textu;
bez `mentions` se původní zmínky odstraní. Pozice jsou v UTF-16 jednotkách
původního vstupního textu. [Podrobnosti zmínek](MCP-MENTIONS.md).

Upravovat lze vlastní textové chatové zprávy, které Signal dovolí upravit.
Platí jeho časový limit a maximální počet úprav (obvykle 24 hodin a 10 úprav,
s výjimkami pro Poznámku sobě). Cizí, smazané, nepodporované nebo již příliš
staré zprávy se odmítnou. Přílohy a identifikovatelná citace se zachovají;
existující link preview se zachová jen pro URL, která zůstala v novém textu.
Citace bez identifikovatelného autora nebo času se odmítne, aby se při úpravě
tiše neodstranila.
Nové přílohy ani novou citaci tento nástroj nepřidává. Původní formátování
textu se nahrazuje spolu s textem.

`queued: true` znamená, že úprava prošla do fronty Signalu, ne potvrzení
doručení všem účastníkům. Výsledek lze ověřit přes `get_message`.

## Smazání

```json
{
  "conversationId": "ID-skupiny",
  "messageId": "ID-zpravy",
  "scope": "for_everyone",
  "idempotencyKey": "smazani-zpravy-001"
}
```

`scope` je povinné a nemá výchozí hodnotu:

- `for_me` použije standardní Signal „smazat pro mě“. Odstranění se může
  synchronizovat na vaše propojená zařízení. Kopie ostatních účastníků zůstanou.
- `for_everyone` odešle standardní požadavek Signalu na odstranění pro
  účastníky. Platí jeho aktuální časové limity a oprávnění autora / admina.
  Admin může mazat cizí zprávy pouze tam, kde to dovolí Signal.

Mezi rozsahy není automatický fallback. Nepodporují se příběhy ani systémové
záznamy. Při `for_me` se vrací `deleted: true` po dokončení lokální operace;
při `for_everyone` se vrací `queued: true` po vložení požadavku do fronty.
To není důkaz odstranění na všech zařízeních příjemců.

Již smazaná zpráva pro všechny vrací `alreadyDeleted: true` a `queued: false`.
Předchozí neúspěšné mazání se neopakuje naslepo.

## Bezpečné opakování a ověření

Oba nástroje vyžadují přesnou shodu `messageId` s `conversationId`.
ID berte z `get_messages`, `get_message` nebo `search_messages`.

Používejte stabilní `idempotencyKey` a po nejistém výsledku opakujte pouze
stejný klíč se stejnými argumenty. Stejný klíč s jiným cílem, textem, zmínkami
nebo rozsahem vrátí `IDEMPOTENCY_CONFLICT`. Ochrana žije v paměti procesu
5 minut; není to trvalý záznam přežívající restart aplikace.

Při timeoutu se vrací `QUEUE_STATUS_UNKNOWN`. Nezakládejte automaticky nový
požadavek s novým klíčem; nejdřív ověřte zprávu. Čtecí nástroje vracejí
`deletedForEveryone` a případný `editedAt` (Unix čas v milisekundách).
