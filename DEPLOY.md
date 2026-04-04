# Deploy Guide — IotaPolis

## Prerequisiti

```bash
# Node.js 18+
node --version

# Homebrew (macOS) — necessario per installare il CLI IOTA
brew --version
```

## 1. Installazione

```bash
git clone <repo-url> iotapolis
cd iotapolis
npm install
cd frontend && npm install && cd ..
```

## 2. Primo avvio (genera config e wallet)

```bash
npm run dev
# Attendi "Sails lifted" poi CTRL+C
# Questo genera: config/private_iota_conf.js con mnemonic e chiavi RSA
```

## 3. Configura le porte (opzionale)

Modifica `config/private_iota_conf.js`:

```javascript
PORT: 1400,          // Backend
FRONTEND_PORT: 5174, // Frontend
```

## 4. Deploy dello Smart Contract

```bash
npm run move:deploy
```

Questo comando:

1. Installa `iota` CLI via Homebrew (se assente)
2. Scarica il framework IOTA Move in `.tmp/` (se assente)
3. Compila il contratto `move/forum/sources/forum.move`
4. Lo pubblica su testnet (richiede faucet automaticamente se il saldo e basso)
5. Salva `FORUM_PACKAGE_ID`, `FORUM_OBJECT_ID`, `ADMIN_CAP_ID` nel config
6. Stampa la **connection string** da condividere

Chi deploya diventa automaticamente ADMIN (ruolo 3) nel contratto.

## 5. Avvio in produzione

```bash
npm run build    # Build frontend
npm start        # Avvia in produzione
```

## 6. Avvio in sviluppo

```bash
npm run dev
# Apri http://localhost:<FRONTEND_PORT>
```

## 7. Condivisione del forum

La connection string ha il formato:

```
testnet:0xPACKAGE_ID:0xFORUM_OBJECT_ID
```

Gli utenti la incollano in "Collegati a un forum esistente" nel setup.
Il sistema sincronizza automaticamente tutti i dati dalla blockchain.

## 8. Gestione ruoli

Il sistema ha 4 livelli di ruolo, tutti verificati on-chain dallo smart contract:

| Livello | Ruolo | Cosa puo fare |
|---------|-------|---------------|
| 0 | BANNED | Nessuna operazione (bloccato on-chain) |
| 1 | USER | Creare thread, postare, votare |
| 2 | MODERATOR | + creare categorie, nascondere post, bannare utenti |
| 3 | ADMIN | + gestire config forum, promuovere/degradare utenti |

Regole:
- **Non puoi promuovere qualcuno a un ruolo >= al tuo**
- **Non puoi modificare utenti con ruolo >= al tuo**
- **Non puoi cambiare il tuo stesso ruolo**
- Ogni nuovo utente parte come USER (ruolo 1)
- Chi deploya il contratto e ADMIN (ruolo 3)
- Un utente bannato (ruolo 0) non puo eseguire nessuna operazione: la transazione viene rifiutata dai validatori IOTA

## 9. Backup (importante!)

Salva in un posto sicuro:

- `config/private_iota_conf.js` — contiene mnemonic (wallet), chiavi RSA, e IDs del contratto
- Il mnemonic e la chiave del wallet admin. **Se lo perdi, perdi il controllo admin del forum.**

## 10. Reset totale

Dalla pagina Impostazioni o via API:

1. Nuovo wallet generato
2. Nuove chiavi RSA
3. DB locale svuotato
4. IDs del contratto Move azzerati
5. **Devi ri-deployare**: `npm run move:deploy`
6. Riavvia il server

## 11. Cambio network (testnet → mainnet)

In `config/private_iota_conf.js`:

```javascript
IOTA_NETWORK: 'mainnet',
IOTA_MNEMONIC: null,
FORUM_PACKAGE_ID: null,
FORUM_OBJECT_ID: null,
ADMIN_CAP_ID: null,
```

Poi:

```bash
npm run dev          # Genera nuovo wallet mainnet
# CTRL+C
npm run move:deploy  # Deploy su mainnet
npm start
```

## Comandi

| Comando | Descrizione |
|---------|-------------|
| `npm run dev` | Avvia backend + frontend in sviluppo |
| `npm start` | Avvia in produzione |
| `npm run build` | Build frontend |
| `npm run move:build` | Compila solo il contratto Move |
| `npm run move:deploy` | Compila + deploya il contratto |
| `npm run move:install-cli` | Installa solo il CLI IOTA |
| `npm run move:fetch-framework` | Scarica il framework IOTA Move in .tmp/ |

## Architettura

```
Utente A (admin)                     Utente B (user)
    |                                    |
    v                                    v
[wallet A] ----moveCall---->  [Smart Contract Move]  <----moveCall---- [wallet B]
                                     |
                               Forum (shared object)
                               |-- users: Table<address, u8>
                               |   |-- 0x9543... -> 3 (ADMIN)
                               |   |-- 0x00329.. -> 1 (USER)
                               |   |-- 0xabc12.. -> 0 (BANNED)
                               |-- event_count, user_count
                               |-- admin: address
                                     |
                        Ogni funzione verifica il ruolo:
                        register()         -> aperta
                        post_event()       -> ruolo >= 1 (USER)
                        mod_post_event()   -> ruolo >= 2 (MOD)
                        admin_post_event() -> ruolo >= 3 (ADMIN)
                        set_user_role()    -> ruolo >= 2 (MOD)
                                     |
                               ForumEvent (emitted)
                               |-- tag, entity_id, data(gzip)
                               |-- version, author, timestamp
                                     |
                         queryEvents({ package: PKG_ID })
                                     |
                         +-----------+-----------+
                         |                       |
                   [SQLite cache A]        [SQLite cache B]
                   (ricostruita)           (ricostruita)
```

Ogni utente paga il proprio gas. Su testnet e gratis (faucet automatico).
I permessi sono verificati dai validatori IOTA — nessun client o server puo bypassarli.

## Mainnet Deployment

### Prerequisiti

- IOTA 2.0 Rebased mainnet attiva e raggiungibile
- Token IOTA mainnet per il gas (acquistabili su exchange o tramite bridge)
- Smart contract testato e auditato (vedi Mainnet Preparation Checklist in CLAUDE.md)

### Steps

1. **Aggiorna la configurazione network** in `config/private_iota_conf.js`:

```javascript
IOTA_NETWORK: 'mainnet',
IOTA_MNEMONIC: null,       // Verra generato al primo avvio
FORUM_PACKAGE_ID: null,
FORUM_OBJECT_ID: null,
ADMIN_CAP_ID: null,
```

2. **Genera un nuovo wallet mainnet**:

```bash
npm run dev    # Genera wallet mainnet automaticamente
# CTRL+C dopo "Sails lifted"
```

3. **Fondi il wallet admin** con IOTA mainnet tokens:
   - Copia l'indirizzo dal log di avvio o da `config/private_iota_conf.js`
   - Invia IOTA tokens da un exchange o wallet esterno
   - Servono almeno 1 IOTA per il deploy del contratto

4. **Deploy dello smart contract su mainnet**:

```bash
npm run move:deploy
```

5. **Aggiorna la connection string** e condividila con gli utenti:

```
mainnet:0xPACKAGE_ID:0xFORUM_OBJECT_ID:0xREGISTRY_ID:0xTREASURY_ID:...
```

6. **Avvia in produzione**:

```bash
npm run build
npm start
```

### Note importanti

- **I dati testnet NON vengono migrati automaticamente.** Il deploy su mainnet crea un forum vuoto. Se necessario, usa un tool di migrazione per esportare dati testnet e reimportarli (vedi checklist).
- **Il faucet non funziona su mainnet.** Gli utenti devono procurarsi IOTA tokens autonomamente, oppure il forum deve implementare sponsored transactions.
- **Backup del mnemonic admin:** se perdi il mnemonic in `private_iota_conf.js`, perdi il controllo admin del forum. Conservalo in un luogo sicuro.
- **AdminCap:** si raccomanda di trasferire l'AdminCap a un multi-sig wallet per maggiore sicurezza in produzione.
- **Gas fees:** ogni azione on-chain costa gas. Stima circa 0.01-0.05 IOTA per operazione (post, vote, tip).
