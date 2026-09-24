# HTTPS e rete

La Even Realities App carica la pagina degli occhiali **dall'origine di Foundry** e la WebView del telefono **rifiuta i certificati autofirmati**. Un indirizzo LAN come `http://192.168.x.x:30000` **non funziona**.

## 🏗️ Perché Foundry deve servire la pagina

- Le app Even Hub impacchettate hanno una whitelist di origini **fissa per build, senza wildcard**, e la whitelist **non aggira il CORS** ([networking](https://hub.evenrealities.com/docs/build/networking)): un'app pacchettizzata non può raggiungere il Foundry di chiunque.
- Foundry v14 accetta la sessione socket **solo dal cookie `session`**, quindi serve un contesto first-party.
- Soluzione: la pagina è servita da Foundry stesso e caricata con il **QR sideload** ([architettura Even Hub](https://hub.evenrealities.com/docs/get-started/architecture)). Stessa origine ⇒ niente CORS, niente whitelist, cookie di prima parte ([ADR-0016](Decisioni-Architetturali)).

## ⚙️ Tre modi per avere HTTPS valido

| Opzione | Come | Note |
|---|---|---|
| **Reverse proxy + Let's Encrypt** | Caddy, nginx o Traefik davanti a Foundry, su un nome DNS pubblico | Segui [foundryvtt.com/article/nginx](https://foundryvtt.com/article/nginx/). Il proxy **deve inoltrare l'upgrade WebSocket** (`Upgrade` / `Connection: upgrade`; Caddy lo fa da solo). In `options.json` di Foundry: `proxySSL: true`, `proxyPort: 443`. |
| **Tailscale** | `tailscale serve` / `tailscale cert` sull'host di Foundry | Certificato `*.ts.net` valido; il telefono deve essere nella stessa tailnet. |
| **TLS nativo di Foundry** | `sslCert` / `sslKey` in `options.json` ([configurazione](https://foundryvtt.com/article/configuration/)) | Usa un certificato vero (es. Let's Encrypt con challenge DNS), non autofirmato. |

## ⚙️ Giochi su The Forge

Un gioco **privato** su The Forge (è l'impostazione predefinita) reindirizza **ogni**
indirizzo — `/join`, `/modules/…`, `/socket.io` — alla pagina "Private Game" finché non si
è entrati con un account The Forge
([Public & Private Games](https://forums.forge-vtt.com/t/public-private-games/3588)).
Gli occhiali funzionano anche con il gioco privato se:

1. **"Automatic User Management" è disattivato** (My Foundry → *Configure Players*):
   se è attivo, The Forge fa entrare l'account con il *suo* utente Foundry e intercetta
   `/join` ([The User Manager](https://forums.forge-vtt.com/t/the-user-manager/11039)),
   quindi l'utente «(G2)» non può accedere;
2. l'account The Forge del giocatore è **invitato** al gioco;
3. sul telefono il giocatore **accede a The Forge una volta dentro l'app Even**: inquadra il
   QR, si apre la pagina "Private Game", usa *Login* (email + password: i login social
   possono essere bloccati dentro l'app), poi **inquadra di nuovo il QR**. Il cookie di
   The Forge vale per `.forge-vtt.com` e dura circa 14 giorni.

Se l'app scrive *«The Forge sta intercettando l'accesso…»* manca uno dei tre punti. Un gioco
**pubblico** evita il punto 3 ma espone la schermata di accesso di Foundry a chiunque abbia
l'URL: ogni utente Foundry, GM compreso, deve avere una password robusta.

## ⚙️ routePrefix

Se Foundry gira sotto un percorso (`routePrefix: "foundry"` → `https://host/foundry/`) non serve altro: l'URL del QR include il prefisso (`foundry.utils.getRoute`) e la build della g2-app usa percorsi relativi. Dietro un proxy, il percorso inoltrato deve coincidere con il `routePrefix` e deve includere `/modules` e `/socket.io`.

## 🐞 L'indirizzo con cui apri Foundry conta

Il QR è costruito dall'indirizzo nella barra del browser di chi lo genera. Se apri Foundry da `http://localhost:30000`, il QR punta a `localhost` e il telefono non lo può aprire: la verifica **indirizzo pubblico** della finestra di associazione diventa ✗. **Riapri Foundry dall'indirizzo pubblico** e genera un nuovo QR.

## 🧪 Verifica GO/NO-GO

Il pacchetto `validation-harness` controlla che la tua istanza possa servire l'app:

```bash
# Solo controlli software (senza telefono)
FOUNDRY_URL=https://foundry.example.org pnpm --filter @evf/validation-harness validate:direct-sideload:skip-hardware

# Completo: controlli software + checklist interattiva sì/no (serve un terminale, telefono, G2 e R1)
FOUNDRY_URL=https://foundry.example.org pnpm --filter @evf/validation-harness validate:direct-sideload
```

`FOUNDRY_URL` è l'indirizzo base **compreso il routePrefix**. Controlli: `https`, `reachable`, `g2-entry`, `api-status` (informativo) e, nella versione completa, `hw-qr-load`, `hw-sdk-bridge`, `hw-cookie-persist`, `hw-socket-reconnect`. Codici di uscita: `0` GO · `1` NO-GO · `2` saltato · `3` errore d'uso. In caso di NO-GO lo script stampa la riserva documentata: Foundry e la pagina dietro un **sottodominio reverse-proxy dello stesso sito**.

## 📚 Vedi anche

- [Risoluzione problemi](Risoluzione-Problemi) · runbook: [`docs/runbook.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/runbook.md)
