# English Trainer · Don Carne

Mobile-First Web-App zum Lernen englischer Business-Sätze und Vokabeln mit SM-2 Spaced Repetition.

## Features

- 600 Einträge zum Start: 300 Sätze + 300 Vokabeln in 22 Kategorien
- Zwei Lernstufen pro Eintrag:
  1. Karteikarte: DE → tippen zum Umdrehen → EN sehen → selbst bewerten
  2. Tipp-Modus: DE wird gezeigt, du tippst EN ein (mit Tippfehler-Toleranz)
- Aufstieg zu Stufe 2 nach 3× erfolgreicher Wiederholung
- SM-2 Spaced Repetition (Anki-Algorithmus): Karten kommen je nach Bewertung in 1, 3, 7, 15+ Tagen wieder
- Eigene Einträge hinzufügen
- JSON-Import: neue Inhalte einfach hochladen
- JSON-Export: Backup deines Fortschritts
- Fortschritts-Statistiken
- PWA: kann auf dem Homescreen installiert werden, funktioniert offline
- Alle Daten bleiben lokal in deinem Browser

## Live-Setup mit GitHub + Vercel

### Voraussetzungen
- GitHub-Account
- Vercel-Account (kostenlos, kann mit GitHub eingerichtet werden)

### Schritt 1 — GitHub Repo erstellen

1. Auf [github.com/new](https://github.com/new) gehen
2. Repository-Name eingeben, z.B. `english-trainer`
3. **Public** lassen (für kostenloses Vercel-Deployment am einfachsten)
4. Auf **Create repository** klicken
5. NICHT "Initialize with README" anhaken — du kommst gleich auf eine leere Seite

### Schritt 2 — Dateien hochladen

**Variante A: Drag & Drop im Browser (einfachste Option)**
1. Auf der leeren Repo-Seite auf **uploading an existing file** klicken
2. Alle Dateien aus dem Projektordner ins Browserfenster ziehen
3. Unten **Commit changes** klicken

**Variante B: Über die Kommandozeile (für später, wenn du Updates machen willst)**

```bash
cd english-trainer
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/english-trainer.git
git push -u origin main
```

### Schritt 3 — Mit Vercel deployen

1. Auf [vercel.com](https://vercel.com) gehen und mit GitHub einloggen
2. **Add New** → **Project**
3. Dein Repository `english-trainer` auswählen → **Import**
4. Bei "Configure Project" alles unverändert lassen
   - Framework Preset: **Other**
   - Root Directory: `./`
   - Build & Output Settings: nichts ändern
5. **Deploy** klicken

Nach 30–60 Sekunden ist die App online und du bekommst eine URL wie `https://english-trainer-xyz.vercel.app`.

### Schritt 4 — Auf dem iPhone installieren

1. URL in **Safari** öffnen (nicht in Chrome!)
2. Auf das **Teilen-Symbol** tippen (Kasten mit Pfeil nach oben)
3. **Zum Home-Bildschirm** auswählen
4. Name bestätigen

Die App liegt jetzt als Icon auf dem Homescreen und startet ohne Browser-Leiste — wie eine native App. Funktioniert auch offline.

### Schritt 5 — Eigene Domain (optional)

Wenn du z.B. `english.doncarne.de` willst:
1. Vercel-Projekt öffnen → **Settings** → **Domains**
2. Custom Domain eingeben
3. Vercel zeigt dir an, welchen DNS-Eintrag du bei deinem Domain-Provider machen musst

## Inhalte erweitern

### Variante 1: In der App
Über **Verwalten** → **+ Neuer Eintrag**

### Variante 2: JSON-Import (für viele Einträge auf einmal)
1. Frag Claude im Chat: "Erstelle mir 50 neue Sätze zum Thema X als JSON-Datei für meinen English Trainer"
2. Du bekommst eine `import.json`-Datei
3. In der App: **Verwalten** → **Import** → Datei auswählen
4. Fertig — die neuen Einträge erscheinen sofort

Das JSON-Format sieht so aus:
```json
{
  "items": [
    { "de": "Lass uns das vertagen.", "en": "Let's postpone this.", "cat": "commit", "type": "phrase" },
    { "de": "Quartalsbericht", "en": "quarterly report", "cat": "business", "type": "vocab" }
  ]
}
```

Die `cat`-Werte müssen mit einer existierenden Kategorie übereinstimmen. Die Werte sind: `greeting`, `understand`, `thinking`, `clarify`, `opinion`, `disagree`, `commit`, `transitions`, `closing`, `negotiation`, `project`, `numbers`, `meeting`, `business`, `money`, `ecommerce`, `verbs`, `time`, `adjectives`, `connectors`, `tech`, `smalltalk`.

`type` ist entweder `"phrase"` oder `"vocab"`.

## Inhalte für mehrere Geräte zentral pflegen

Wenn du Inhalte aus content.json ergänzen willst (so dass sie für ALLE deine Geräte zentral gepflegt sind):
1. Datei `content.json` im GitHub-Repo direkt bearbeiten (im Browser auf die Datei klicken → Stift-Symbol)
2. Neue Einträge im JSON-Array `"items"` ergänzen
3. **Commit changes**
4. Vercel deployed automatisch neu — alle Geräte holen sich beim nächsten Öffnen die neuen Inhalte

## Lokales Testen vor Deploy

```bash
# Mit Python (kommt auf macOS vorinstalliert)
cd english-trainer
python3 -m http.server 8000
# Im Browser: http://localhost:8000
```

Oder einfach `index.html` doppelklicken (manche Features wie der Service Worker funktionieren nur über einen echten HTTP-Server).
