# Liquid Mirror

Browserbasierte interaktive Installation fuer ein Bachelorprojekt. Die Webcam wird wie ein Spiegel dargestellt. Ein automatisch wiederholter Loop fuehrt vom normalen Livebild ueber einen subtilen Beautyfilter zu einer blau-grauen, glaenzenden Silikonschicht, die nach unten laeuft und danach wieder verschwindet.

## Dateien

- `index.html` enthaelt die Seite und laedt die Skripte.
- `style.css` gestaltet den dunklen Ausstellungsmodus.
- `script.js` startet die Webcam, trackt das Gesicht mit MediaPipe FaceMesh und zeichnet die Effekte auf ein Canvas.
- `vendor/mediapipe-face-mesh/` enthaelt die lokal eingebundene FaceMesh-Bibliothek.

## Lokal starten

Die Kamera funktioniert in modernen Browsern am zuverlaessigsten ueber `localhost`, nicht direkt per Doppelklick auf die Datei.

1. Oeffne den Projektordner im Terminal.
2. Starte einen kleinen lokalen Server:

```bash
python3 -m http.server 8000
```

3. Oeffne im Browser:

```text
http://localhost:8000
```

4. Klicke auf `Installation starten` und erlaube den Kamerazugriff.

## Ueber GitHub Pages veroeffentlichen

Ja, das Projekt kann ueber GitHub Pages laufen. Das ist fuer die Webcam sogar sinnvoll, weil GitHub Pages die Seite ueber HTTPS ausliefert. Browser erlauben Kamerazugriff normalerweise nur auf `localhost` oder auf HTTPS-Seiten.

1. Erstelle auf GitHub ein neues Repository.
2. Lade den Inhalt dieses Projektordners hoch, also `index.html`, `style.css`, `script.js`, `README.md`, `.nojekyll` und den Ordner `vendor/`.
3. Oeffne in GitHub das Repository und gehe zu `Settings` > `Pages`.
4. Waehle bei `Source` den Branch `main` und den Ordner `/root`.
5. Speichere die Einstellung.
6. Nach kurzer Wartezeit ist die Installation unter einer Adresse wie dieser erreichbar:

```text
https://dein-name.github.io/dein-repository/
```

Beim ersten Oeffnen fragt der Browser nach Kamerazugriff. Auf iPhone/iPad und in manchen Browsern kann die Erlaubnis strenger behandelt werden; auf einem Laptop mit Chrome, Edge oder Safari sollte es ueber die GitHub-Pages-URL funktionieren.

## Offline-Hinweis

Die benoetigten MediaPipe-Dateien liegen lokal im Ordner `vendor/mediapipe-face-mesh/`. Fuer die Ausstellung muss der Laptop deshalb keine externe Bibliothek nachladen. Der lokale Server ist trotzdem wichtig, weil Browser Kamerazugriff normalerweise nur auf `localhost` oder HTTPS erlauben.

## Ablauf des Loops

Der Loop dauert etwa 22 Sekunden:

1. Normales Webcam-Bild
2. Subtiler Beautyfilter mit weicherer Haut, leicht vergroesserten Augen und sanfter Symmetrie-Andeutung
3. Uebergang in eine halbtransparente blau-graue Silikonschicht
4. Organisches Tropfen und Nach-unten-Laufen der Maske
5. Ausblenden zurueck zum ungefilterten Spiegelbild

## Performance

- Das Videobild wird auf ein einziges Canvas gezeichnet.
- FaceMesh wird auf eine Person begrenzt.
- Das Tracking laeuft mit maximal ca. 30 Messungen pro Sekunde.
- Die Effekte sind prozedural gezeichnet und benoetigen keine grossen Bilddateien.

Falls es auf einem Laptop ruckelt, kann in `script.js` `TRACKING_INTERVAL_MS` erhoeht werden, zum Beispiel von `34` auf `50`.
