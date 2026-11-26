// Google Apps Script für das Sheet "miworu-Bugfixes" (Erweiterungen -> Apps Script).
// 1) Dieses Skript einfügen, SECRET unten durch einen langen Zufallswert ersetzen (denselben Wert in Vercel als REPORT_SECRET eintragen).
// 2) Bereitstellen -> Neue Bereitstellung -> Typ "Web-App": Ausführen als "Ich", Zugriff "Jeder". URL kopieren und in Vercel als REPORT_WEBHOOK_URL eintragen.
// Fahrtenprotokoll: Eintraege mit typ "fahrt" landen im Blatt "Fahrten" (wird automatisch angelegt): Zeit | Nickname | Strecke.
// Spaltenreihenfolge im Blatt: Fehlerart | Strecke | Position | Nachricht | Zeit | Gerät/Browser | Grafik | Trainer | Version | Kontakt | Status
const SECRET = 'HIER-LANGEN-ZUFALLSWERT-EINTRAGEN';
const FAHRTEN = 'Fahrten';
const SHEET = 'Tabellenblatt1';   // Name des Blatts, falls umbenannt: hier anpassen

function safe(v) {   // verhindert, dass Text als Formel ausgeführt wird
  v = String(v == null ? '' : v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false });
    if (d.typ === 'fahrt') {   // Fahrtenprotokoll
      const ss = SpreadsheetApp.getActive();
      let fs = ss.getSheetByName(FAHRTEN);
      if (!fs) { fs = ss.insertSheet(FAHRTEN); fs.appendRow(['Zeit', 'Nickname', 'Strecke']); fs.setFrozenRows(1); fs.getRange('A1:C1').setFontWeight('bold'); }
      fs.appendRow([new Date(), safe(d.name), safe(d.route)]);
      return out({ ok: true });
    }
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET) || SpreadsheetApp.getActiveSheet();
    sh.appendRow([safe(d.cat), safe(d.route), safe(d.pos), safe(d.msg), new Date(), safe(d.device), safe(d.gfx), safe(d.trainer), safe(d.ver), safe(d.contact), 'offen']);
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false });
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
