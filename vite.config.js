// Streckendaten werden pro Strecke per dynamic import nachgeladen (Top-Level-await im Spiel)
// json.stringify: grosse Streckendaten (LoD2, Gelaende) als JSON.parse-String statt als JS-Objektliteral -> deutlich weniger Speicher beim Build
export default { build: { target: 'es2022' }, esbuild: { target: 'es2022' }, json: { stringify: true } };
