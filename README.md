# AI Chat Testbench

En testbenk for å iterere på AI-chat-oppførsel med rollebasert kontekst, dokumenthåndtering og chat-historikk.

## Funksjoner

- **Rollebasert chat**: Bytt mellom Interessent og Selger - hver rolle har sin egen systemprompt
- **Dokumentkontekst**: Last opp PDF, TXT, MD og andre filer som kontekst for chatten
- **Chat-historikk**: Lagre og hent frem tidligere chatter med full kontekstlogg
- **Versjonering**: Hver chat får et unikt versjonsnummer du kan spore i loggen
- **Eksport/Import**: Eksporter chat-historikk som JSON for backup eller deling

---

## Kom i gang (steg-for-steg)

### Forutsetninger

Du trenger **Node.js** installert på maskinen din. 

#### Sjekk om du har Node.js:
Åpne Terminal (Mac/Linux) eller Ledetekst/PowerShell (Windows) og skriv:
```bash
node --version
```

Hvis du får et versjonsnummer (f.eks. `v18.17.0`), er du klar. Hvis ikke, installer Node.js:

#### Installer Node.js:
1. Gå til https://nodejs.org
2. Last ned **LTS-versjonen** (anbefalt for de fleste)
3. Kjør installasjonsfilen og følg instruksjonene
4. Start terminalen på nytt og kjør `node --version` for å verifisere

---

### Installasjon

#### 1. Last ned prosjektet

Lagre alle filene i en mappe på datamaskinen din, for eksempel:
- Mac/Linux: `~/Projects/ai-testbench/`
- Windows: `C:\Users\DittNavn\Projects\ai-testbench\`

Mappestrukturen skal se slik ut:
```
ai-testbench/
├── package.json
├── README.md
├── public/
│   └── index.html
└── src/
    ├── index.js
    └── App.js
```

#### 2. Åpne terminal i prosjektmappen

**Mac:**
1. Åpne Terminal (Cmd + Space, skriv "Terminal")
2. Naviger til mappen: `cd ~/Projects/ai-testbench`

**Windows:**
1. Åpne mappen i Utforsker
2. Skriv `cmd` i adressefeltet og trykk Enter
   
   ELLER
   
1. Åpne PowerShell/Ledetekst
2. Naviger til mappen: `cd C:\Users\DittNavn\Projects\ai-testbench`

#### 3. Installer avhengigheter

Kjør denne kommandoen i terminalen:
```bash
npm install
```

Dette vil ta 1-3 minutter første gang. Du vil se en `node_modules`-mappe bli opprettet.

#### 4. Start applikasjonen

Du må kjøre **to terminaler** samtidig:

**Terminal 1 - Backend (API-proxy):**
```bash
npm run server
```
Du skal se: `✓ API-proxy kjører på http://localhost:3001`

**Terminal 2 - Frontend (React):**
```bash
npm start
```
Nettleseren åpnes automatisk på `http://localhost:3000`

> 💡 **Tips:** Hold begge terminalene åpne mens du bruker appen.

🎉 **Ferdig!** Testbenken kjører nå lokalt.

---

## Bruk

### Første gang

1. Gå til **Admin**-fanen
2. Legg inn din **Anthropic API-nøkkel** (hent fra https://console.anthropic.com)
3. Velg en **rolle** (Interessent eller Selger)
4. Last opp **dokumenter** som skal brukes som kontekst
5. Gå til **Chat**-fanen og start samtalen

### Roller

| Rolle | Beskrivelse |
|-------|-------------|
| **Interessent** | Potensiell kjøper - får kun offentlig tilgjengelig informasjon |
| **Selger** | Boligeier - får full tilgang til all informasjon |

Du kan tilpasse systempromptene for hver rolle i Admin-panelet.

### Chat-historikk

- Chatter lagres automatisk i nettleseren (localStorage)
- Klikk på en chat i sidepanelet for å hente den frem
- Klikk på versjonsnummeret (f.eks. `v20240115-143022`) for å se full kontekst
- Bruk **Eksporter** for å laste ned alle chatter som JSON-fil
- Bruk **Importer** for å laste inn chatter fra en JSON-fil

### Kontekst-logg

Hver chat lagrer:
- Versjonsnummer (tidsstempel)
- Aktiv rolle
- Systemprompt som ble brukt
- Liste over dokumenter med størrelse
- Tidspunkt for opprettelse

---

## Feilsøking

### "Load failed" eller CORS-feil
Sjekk at backend-serveren kjører:
1. Åpne en ny terminal i prosjektmappen
2. Kjør `npm run server`
3. Verifiser at du ser "✓ API-proxy kjører på http://localhost:3001"

### "npm: command not found"
Node.js er ikke installert eller ikke i PATH. Installer på nytt fra nodejs.org.

### "EACCES permission denied"
På Mac/Linux, prøv:
```bash
sudo npm install
```

### Nettleseren åpner seg ikke
Gå manuelt til http://localhost:3000

### API-feil
- Sjekk at API-nøkkelen er korrekt
- Sjekk at du har credits på Anthropic-kontoen
- Sjekk internettforbindelsen

### Chatten lagres ikke
- Sjekk at nettleseren ikke er i privat/incognito-modus
- Sjekk at localStorage ikke er blokkert

---

## Stoppe applikasjonen

Trykk `Ctrl + C` i terminalen for å stoppe serveren.

---

## Teknisk info

- **Framework**: React 18
- **API**: Anthropic Claude API
- **Lagring**: localStorage + JSON-eksport
- **PDF-støtte**: PDF.js (lastes fra CDN)

---

## Lisens

MIT - fri bruk for alle formål.
