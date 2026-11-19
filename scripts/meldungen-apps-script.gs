// Google Apps Script für das Sheet "miworu-Bugfixes" (Erweiterungen -> Apps Script).
// 1) Dieses Skript einfügen, SECRET unten durch einen langen Zufallswert ersetzen (denselben Wert in Vercel als REPORT_SECRET eintragen).
// 2) Bereitstellen -> Neue Bereitstellung -> Typ "Web-App": Ausführen als "Ich", Zugriff "Jeder". URL kopieren und in Vercel als REPORT_WEBHOOK_URL eintragen.
// Spaltenreihenfolge im Blatt: Fehlerart | Strecke | Position | Nachricht | Zeit | Gerät/Browser | Grafik | Trainer | Version | Kontakt | Status
const SECRET = 'HIER-LANGEN-ZUFALLSWERT-EINTRAGEN';
const SHEET = 'Tabellenblatt1';   // Name des Blatts, falls umbenannt: hier anpassen

function safe(v) {   // verhindert, dass Text als Formel ausgeführt wird
  v = String(v == null ? '' : v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false });
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
