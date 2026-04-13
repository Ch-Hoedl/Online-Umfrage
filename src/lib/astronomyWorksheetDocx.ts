import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

function h(text: string, level: HeadingLevel) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { after: 200 },
  });
}

function p(text: string, opts?: { bold?: boolean; spacingAfter?: number }) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
      }),
    ],
    spacing: { after: opts?.spacingAfter ?? 120 },
  });
}

function pb(text: string) {
  return new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 60 },
  });
}

function spacer(lines = 1) {
  return new Paragraph({
    text: " ",
    spacing: { after: 120 * lines },
  });
}

function simpleTable(rows: string[][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (r) =>
        new TableRow({
          children: r.map(
            (cellText) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: cellText })],
                  }),
                ],
              })
          ),
        })
    ),
  });
}

export function buildAstronomyWorksheetDocx(withSolutions: boolean) {
  const title = "Arbeitsblatt: Sonnensystem, Zeit & Raum – und kuriose Fragen aus dem All";
  const docTitle = withSolutions ? `${title} (mit Lösungen)` : title;

  const fill = (blank: string, answer: string) => (withSolutions ? answer : blank);

  const a1 = withSolutions
    ? "1. Merkur (S)  2. Venus (S)  3. Erde (S)  4. Mars (S)  5. Jupiter (G)  6. Saturn (G)  7. Uranus (G)  8. Neptun (G)"
    : "1. ____________  2. ____________  3. ____________  4. ____________\n5. ____________  6. ____________  7. ____________  8. ____________";

  const a2Pluto = withSolutions
    ? "Pluto umkreist zwar die Sonne und ist (fast) rund, aber er hat seine Umlaufbahn nicht „freigeräumt“. In seiner Region (Kuipergürtel) gibt es viele ähnliche Körper. Deshalb gilt er als Zwergplanet."
    : "______________________________________________________________________________\n______________________________________________________________________________";

  const a4 = withSolutions
    ? "Ein Sonnensystem besteht aus einem Stern (z.B. der Sonne) und allen Körpern, die durch seine Schwerkraft gebunden sind, z.B. Planeten, Monde, Asteroiden und Kometen."
    : "Ein Sonnensystem besteht aus einem ____________________ (z.B. der Sonne) und allen Körpern, die durch seine ____________________ gebunden sind, z.B. ____________________, ____________________, ____________________.";

  const b1 = withSolutions
    ? "Wenn ein Stern 100 Lichtjahre entfernt ist, sehen wir sein Licht, das ungefähr 100 Jahre unterwegs war."
    : "Wenn ein Stern 100 Lichtjahre entfernt ist, dann ist das Licht, das wir heute sehen, ungefähr …\n☐ 100 Tage alt  ☐ 100 Jahre alt  ☐ 1000 Jahre alt\n\nBegründung: _________________________________________________________________";

  const b2 = withSolutions
    ? "Ein Lichtjahr ist eine Entfernung. Es ist die Strecke, die Licht in einem Jahr zurücklegt."
    : "Ein Lichtjahr ist eine ____________________ (Zeit / Entfernung).\nEs ist die Strecke, die Licht in ____________________ zurücklegt.";

  const b3a = withSolutions
    ? "Kilometer wären im Weltall riesige Zahlen mit sehr vielen Nullen. Mit Lichtjahren kann man große Entfernungen kompakter angeben."
    : "Erkläre in 1–2 Sätzen, warum Kilometer im Weltall unpraktisch sind.\n______________________________________________________________________________";

  const b3b = fill(
    "9,46 · 10¹² km = ______________________________ km",
    "9,46 · 10¹² km = 9.460.000.000.000 km"
  );

  const b4 = withSolutions
    ? "Lösungshinweis: Die Entfernungen ändern sich laufend. Suche tagesaktuell z.B. bei NASA/JPL („Where are the Voyagers?“) und notiere Datum + Wert in AE (Astronomische Einheiten)."
    : "Recherche-Aufgabe (aktuell):\nSuche (mit Datum!) die Entfernung von Voyager 1 und Voyager 2 zur Sonne in AE oder km.\n- Voyager 1: ____________________ (Quelle/Datum: ____________________)\n- Voyager 2: ____________________ (Quelle/Datum: ____________________)\n\nMerksatz: 1 AE (Astronomische Einheit) ≈ Entfernung Erde–Sonne.";

  const b5_1 = withSolutions
    ? "Vorbeiflüge (Flybys) an den äußeren Planeten, Messungen des Sonnenwinds und später Erforschung des Randes der Heliosphäre / interstellaren Raums."
    : "1) Was war das Ziel der Voyager-Missionen?\n______________________________________________________________________________";

  const b5_2 = withSolutions
    ? "Beispiele: Grüße in vielen Sprachen, Musik (z.B. Bach), Alltagsgeräusche der Erde, Bilder/Diagramme, Naturgeräusche."
    : "2) Nenne 3 Dinge, die auf der Golden Record gespeichert sind.\n- ____________________  - ____________________  - ____________________";

  const b5_3 = fill(
    "3) Welcher Österreicher ist darauf zu hören (Botschaft/Grußwort)? _________________________",
    "3) Welcher Österreicher ist darauf zu hören? Kurt Waldheim (UN-Generalsekretär)."
  );

  const b6 = withSolutions
    ? "Typisch etwa 6–9 Monate. Die Zeit hängt davon ab, wo Erde und Mars auf ihren Umlaufbahnen stehen und welche Flugbahn (Energie) gewählt wird."
    : "Nenne eine typische Reisezeit mit heutiger Technik (Richtwert) und erkläre, warum sie nicht immer gleich ist.\nZeit: ____________________\nWarum unterschiedlich? _________________________________________________________";

  const b7 = withSolutions
    ? "Schall sind Druckwellen und brauchen ein Medium (Luft, Wasser). Im All ist (fast) Vakuum – darum hört man nichts. Licht sind elektromagnetische Wellen: Sie können sich auch im Vakuum ausbreiten, deshalb sehen wir Sterne."
    : "Erkläre den Unterschied zwischen Schall und Licht (2–4 Sätze).\n______________________________________________________________________________\n______________________________________________________________________________";

  const c1 = withSolutions
    ? "Es ist unbekannt. Es gibt sehr viele Planeten und manche sind lebensfreundlich – aber wir kennen bisher nur ein Beispiel für Leben (die Erde)."
    : "Kreuze an und begründe.\n☐ sehr unwahrscheinlich ☐ eher unwahrscheinlich ☐ eher wahrscheinlich ☐ sehr wahrscheinlich\n\nBegründung: _________________________________________________________________";

  const c2 = withSolutions
    ? "Bei 10 Lichtjahren braucht Licht 10 Jahre. Ein Raumschiff wäre viel langsamer als Licht (heute ein winziger Bruchteil der Lichtgeschwindigkeit) und bräuchte daher extrem lange."
    : "Nimm an, ein Planet ist 10 Lichtjahre entfernt.\n- Wie lange braucht Licht für die Strecke? ____________________\n- Warum würde ein Raumschiff (heutige Technik) viel länger brauchen?\n______________________________________________________________________________";

  const c3 = withSolutions
    ? "„Beamen“ von Menschen wie in Science-Fiction ist nach heutiger Physik nicht absehbar: Man müsste den gesamten Zustand eines Körpers erfassen und anderswo wieder zusammensetzen – das wäre extrem aufwendig und würde enorme Energie/Information erfordern. Quantenteleportation gibt es, aber sie überträgt nur Quantenzustände (Information) einzelner Teilchen, nicht Materie."
    : "Antworte in 3–5 Sätzen: Was sagt die Physik heute dazu?\n(Hinweise: Materie/Information, enorme Energiemengen, Quantenteleportation ≠ Menschen beamen)\n______________________________________________________________________________\n______________________________________________________________________________";

  const c4 = withSolutions
    ? "Ursprung: vor allem die Babylonier (Antike), später von den Griechen weiterentwickelt. Nutzung: Kalender, Jahreszeiten, Navigation und (später) Deutungssysteme."
    : "Notiere:\n- Ursprung (Kultur/Zeitraum): ________________________________________________\n- Wozu wurden Sternbilder/Sternzeichen früher genutzt? __________________________";

  const closing = withSolutions
    ? "(Beispielantwort) Am spannendsten fand ich ________, weil ________."
    : "Welche Frage aus dem Arbeitsblatt fandest du am spannendsten – und warum?\n______________________________________________________________________________";

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: docTitle, bold: true })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 250 },
          }),
          p("Name: ________________________   Datum: _______________   Klasse: _______", { spacingAfter: 250 }),

          h("Lernziele", HeadingLevel.HEADING_2),
          pb("… die Planeten unseres Sonnensystems benennen und vergleichen."),
          pb("… erklären, was ein Planet ist (und warum Pluto als Zwergplanet gilt)."),
          pb("… Entfernungen im Weltall (Lichtjahr) verstehen und grob umrechnen."),
          pb("… Grundbegriffe (Stern, Asteroid, roter Riese, weißer Zwerg) unterscheiden."),
          pb("… kuriose Fragen mit Physik begründen."),
          spacer(),

          h("A) Grundlagen: Das Sonnensystem – die Planeten", HeadingLevel.HEADING_1),

          h("A1 Planeten-Reihe", HeadingLevel.HEADING_2),
          p("Aufgabe: Schreibe die 8 Planeten in der richtigen Reihenfolge von der Sonne aus."),
          p(a1),
          p(
            withSolutions
              ? "Zusatz: (S) = Gesteinsplanet, (G) = Gas-/Eisriese."
              : "Zusatz: Markiere Gasriesen/Eisriesen mit (G) und Gesteinsplaneten mit (S)."
          ),
          spacer(),

          h("A2 Was ist ein Planet – und was nicht? (Pluto?)", HeadingLevel.HEADING_2),
          p("Info-Kasten (zum Ausfüllen): Ein Himmelskörper gilt als Planet, wenn er …"),
          p(
            withSolutions
              ? "1) die Sonne umkreist: Ja   2) (fast) rund ist: Ja   3) seine Umlaufbahn „freigeräumt“ hat: Ja"
              : "1) die Sonne umkreist: Ja / Nein\n2) durch eigene Schwerkraft (fast) rund ist: Ja / Nein\n3) seine Umlaufbahn „freigeräumt“ hat: Ja / Nein"
          ),
          p("Aufgabe: Erkläre in 2–3 Sätzen, warum Pluto heute als Zwergplanet gilt."),
          p(a2Pluto),
          spacer(),

          h("A3 Planeten-Vergleich", HeadingLevel.HEADING_2),
          p(
            withSolutions
              ? "Aufgabe: Beispiel-Lösungen (du kannst auch andere richtige Angaben verwenden)."
              : "Aufgabe: Trage zu mindestens 4 Planeten Unterschiede ein (Stichworte reichen)."
          ),
          simpleTable([
            [
              "Planet",
              "Größe (klein/mittel/groß)",
              "Zusammensetzung (Gestein/Gas/Eis)",
              "Besonderheit",
            ],
            [
              "Merkur",
              fill("", "klein"),
              fill("", "Gestein"),
              fill("", "nächster Planet zur Sonne; keine dichte Atmosphäre"),
            ],
            [
              "Erde",
              fill("", "mittel"),
              fill("", "Gestein"),
              fill("", "flüssiges Wasser; Leben; 1 Mond"),
            ],
            [
              "Jupiter",
              fill("", "sehr groß"),
              fill("", "Gas"),
              fill("", "viele Monde; Großer Roter Fleck"),
            ],
            [
              "Saturn",
              fill("", "sehr groß"),
              fill("", "Gas"),
              fill("", "sehr auffällige Ringe"),
            ],
            [
              "(frei)",
              fill("__________", "Mars"),
              fill("__________", "klein–mittel"),
              fill("__________", "Gestein"),
              fill("________________________", "rötlich; dünne Atmosphäre"),
            ],
          ]),
          spacer(),
          p(
            withSolutions
              ? "Frage: „Umlaufbahn“ = die (meist elliptische) Bahn, auf der ein Objekt um ein anderes kreist."
              : "Frage: Was könnte „Umlaufbahn“ bedeuten? _______________________________________________________"
          ),
          spacer(),

          h("A4 Was ist ein Sonnensystem?", HeadingLevel.HEADING_2),
          p(a4),
          spacer(),

          h("A5 Begriffe: Stern, Asteroid, roter Riese, weißer Zwerg", HeadingLevel.HEADING_2),
          p("Aufgabe: Verbinde (oder schreibe die passenden Buchstaben dazu)."),
          p(
            withSolutions
              ? "1. Stern = C   2. Asteroid = A   3. Roter Riese = D   4. Weißer Zwerg = B"
              : "1. Stern ___\n2. Asteroid ___\n3. Roter Riese ___\n4. Weißer Zwerg ___"
          ),
          p(
            "A) Kleiner Gesteins-/Metallkörper, meist zwischen Mars und Jupiter\nB) Sehr dichter, kleiner „Rest“ eines sonnenähnlichen Sterns\nC) Leuchtender Himmelskörper mit Kernfusion\nD) Aufgeblähte späte Sternphase: wirkt rötlich"
          ),
          spacer(2),

          h("B) Grundlagen: Zeit & Raum (Lichtjahre, Entfernungen, …)", HeadingLevel.HEADING_1),

          h("B1 Wie alt ist Sternenlicht?", HeadingLevel.HEADING_2),
          p(b1),
          spacer(),

          h("B2 Was ist ein Lichtjahr?", HeadingLevel.HEADING_2),
          p(b2),
          spacer(),

          h("B3 Warum misst man nicht in Kilometern?", HeadingLevel.HEADING_2),
          p(b3a),
          p("Aufgabe 2 (Rechnen): 1 Lichtjahr ≈ 9,46 Billionen km (= 9,46 · 10¹² km)."),
          p(b3b),
          spacer(),

          h("B4 Voyager 1 & 2 – wo sind sie jetzt?", HeadingLevel.HEADING_2),
          p(b4),
          spacer(),

          h("B5 Mission & Goldene Schallplatte", HeadingLevel.HEADING_2),
          p(b5_1),
          p(b5_2),
          p(b5_3),
          spacer(),

          h("B6 Wie lange dauert eine Reise zum Mars?", HeadingLevel.HEADING_2),
          p(b6),
          spacer(),

          h("B7 Warum hört man im All nichts – sieht aber Licht?", HeadingLevel.HEADING_2),
          p(b7),
          spacer(2),

          h("C) Kuriose Fakten & Diskussion (mit Physik begründen)", HeadingLevel.HEADING_1),

          h("C1 Wie wahrscheinlich ist außerirdisches Leben?", HeadingLevel.HEADING_2),
          p(c1),
          spacer(),

          h("C2 Wenn wir Aliens finden: Wie lange dauert es?", HeadingLevel.HEADING_2),
          p(c2),
          spacer(),

          h("C3 Wird „Beamen“ jemals möglich sein?", HeadingLevel.HEADING_2),
          p(c3),
          spacer(),

          h("C4 Sternzeichen: Wer hat sie erfunden/entdeckt?", HeadingLevel.HEADING_2),
          p(c4),
          spacer(),

          h("C5 Astrologe vs. Astronom", HeadingLevel.HEADING_2),
          p(
            withSolutions
              ? "Beispiel-Unterschiede:"
              : "Aufgabe: Erstelle eine Mini-Tabelle (mindestens 2 Unterschiede)."
          ),
          simpleTable([
            ["Astronomie", "Astrologie"],
            [
              fill("", "Naturwissenschaft (Messungen, Modelle, Überprüfung)"),
              fill("", "Deutungssystem (Horoskope), nicht naturwissenschaftlich überprüfbar"),
            ],
            [
              fill("", "beschreibt/erklärt Himmelskörper und Prozesse"),
              fill("", "interpretiert Sternzeichen als Einfluss auf Menschen"),
            ],
          ]),
          spacer(),

          h("Abschlussfrage (freiwillig)", HeadingLevel.HEADING_2),
          p(closing),
        ],
      },
    ],
  });

  return doc;
}

export async function downloadAstronomyWorksheetDocx(withSolutions: boolean) {
  const doc = buildAstronomyWorksheetDocx(withSolutions);
  const blob = await Packer.toBlob(doc);

  const fileName = withSolutions
    ? "Arbeitsblatt_Sonnensystem_mit_Loesungen.docx"
    : "Arbeitsblatt_Sonnensystem_ohne_Loesungen.docx";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
