// Baut audio/theme_song_data.js (+ audio/theme_song.flac zum Reinhören) aus dem
// Roh-Recording theme_song.mp3 (Projekt-Root).
//
// WICHTIG: nach jeder Parameteränderung hier unten muss dieses Skript neu
// laufen (`node audio/build_loop.js`) — das Bearbeiten der Datei allein
// verändert nichts, es gibt keinen Watch-Modus.
//
// Drei Ursachen für Klicks beim Loopen wurden hier behoben — Best-Practice-
// Recherche (siehe Chat) bestätigt: das native <audio loop> ist für nahtloses
// Looping grundsätzlich NICHT geeignet, unabhängig vom Zuschneiden der Datei.
//
// 1) Wiedergabe-Mechanismus: der native <audio loop> (HTMLMediaElement) spult
//    beim Loop-Punkt neu auf/an, was in jedem Browser eine kleine, nicht
//    kontrollierbare Lücke/Verzögerung erzeugt — das ist keine Frage der
//    Zuschnitt-Qualität, das Element ist dafür schlicht nicht gebaut. Fix:
//    js/settings.js nutzt jetzt die Web Audio API (AudioBufferSourceNode mit
//    loop=true), die den kompletten PCM-Puffer sample-genau abspielt statt
//    komprimierte Container-Frames zu wiederholen — das ist die etablierte
//    Methode für gapless Loops im Browser.
//
// 2) Content-Naht: Kopf (0..XFADE) und Ende (Ende-XFADE..Ende) des Recordings
//    passen an der Schnittstelle nicht exakt zusammen. Fix: beide werden in
//    reinem PCM (Sample-Array) übergeblendet ("Naht"), diese Naht ersetzt
//    Kopf+Ende und hängt ans Ende des unveränderten Mittelteils. Das passiert
//    hier manuell in JS, NICHT über ffmpegs acrossfade-Filter — bei exakt
//    gleich langen Kopf-/Ende-Segmenten (Länge == XFADE) liefert
//    acrossfade+concat in der Praxis einen unstetigen Übergang (getestet:
//    Sprung von mehreren tausend PCM-Einheiten an der Naht statt Kontinuität).
//
// 3) Container-Lücke: MP3 (LAME) fügt beim Encoden Priming-Samples/Padding ein
//    (~26ms), die decodeAudioData je nach Browser unterschiedlich behandeln
//    (Chromium/Firefox zeigen dafür teils eine hörbare Lücke, Safari nicht —
//    uneinheitlich). FLAC ist verlustfrei und hat kein Encoder-Delay, daher
//    identisches Verhalten überall. Ausgabe daher als FLAC, base64-kodiert
//    direkt in eine .js-Datei eingebettet (audio/theme_song_data.js), NICHT
//    per fetch() nachgeladen — index.html?debug=1 wird oft direkt per file://
//    geöffnet (siehe CLAUDE.md), und fetch()/XHR auf lokale Dateien scheitert
//    dort an Chromes CORS-Regel für file://. Ein normaler <script>-Tag lädt
//    dagegen unter file:// wie unter http:// gleichermaßen zuverlässig.
//
// Nutzung: Parameter unten anpassen, `node audio/build_loop.js` laufen lassen.
// Das Skript loggt die Sample-Differenz an der neuen Loop-Naht (Kontinuitäts-
// Check) — Richtwert ist der "typische Nachbar-Sample-Unterschied" in der
// Skriptausgabe; liegt die Naht-Differenz in derselben Größenordnung, ist der
// Übergang unhörbar.

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── Parameter zum Finetuning ──────────────────────────────────────────────────
const START_TRIM = 0.0;   // Sekunden am Anfang wegschneiden (z.B. Knacken/Stille beim Aufnahmestart)
const END_TRIM = 0.0;   // Sekunden am Ende wegschneiden (z.B. Ausklang, der nicht loopen soll)
const XFADE = 0.5;   // Länge der Überblendung an der Loop-Naht, in Sekunden. 0 = harter Schnitt (klickt garantiert)
const CURVE = 'equal-power'; // 'equal-power' (empfohlen, kein Lautstärke-Einbruch in der Mitte) | 'linear'

const ROOT = path.join(__dirname, '..');
const INPUT = path.join(ROOT, 'theme_song.mp3');
const OUTPUT = path.join(__dirname, 'theme_song.flac');

const SR = 44100, CH = 2, BYTES_PER_FRAME = CH * 2; // 16-bit stereo

// ── 1) Roh-PCM aus dem Recording holen ────────────────────────────────────────
const tmpPcm = path.join(os.tmpdir(), `da_loop_src_${Date.now()}.pcm`);
execSync(`ffmpeg -y -v error -i "${INPUT}" -f s16le -ar ${SR} -ac ${CH} "${tmpPcm}"`);
const raw = fs.readFileSync(tmpPcm);
fs.unlinkSync(tmpPcm);

const totalFrames = raw.length / BYTES_PER_FRAME;
const startTrimN = Math.round(START_TRIM * SR);
const endTrimN = Math.round(END_TRIM * SR);
const xfadeN = Math.round(XFADE * SR);

const usableFrames = totalFrames - startTrimN - endTrimN;
if (usableFrames <= xfadeN * 2) {
    console.error(`Nach Trim bleiben nur ${(usableFrames / SR).toFixed(2)}s Material — XFADE=${XFADE}s braucht mindestens ${(xfadeN * 2 / SR).toFixed(2)}s. START_TRIM/END_TRIM/XFADE anpassen.`);
    process.exit(1);
}

const headStart = startTrimN;                              // Kopf: erste XFADE Sekunden (nach Start-Trim)
const tailEnd = totalFrames - endTrimN;                  // Ende: letzte XFADE Sekunden (vor End-Trim)
const tailStart = tailEnd - xfadeN;
const midStart = headStart + xfadeN;
const midEnd = tailStart;
const midFrames = midEnd - midStart;
const outFrames = midFrames + xfadeN;

function readSample(frameIdx, ch) {
    return raw.readInt16LE(frameIdx * BYTES_PER_FRAME + ch * 2);
}

// ── 2) Ausgabe-Buffer bauen: Mittelteil unverändert + übergeblendete Naht ─────
const out = Buffer.alloc(outFrames * BYTES_PER_FRAME);

for (let i = 0; i < midFrames; i++) {
    for (let ch = 0; ch < CH; ch++) {
        out.writeInt16LE(readSample(midStart + i, ch), i * BYTES_PER_FRAME + ch * 2);
    }
}

for (let i = 0; i < xfadeN; i++) {
    const t = i / (xfadeN - 1); // 0 → 1 über die Naht, erreicht an den Rändern exakt 0/1
    let fadeOut, fadeIn;
    if (CURVE === 'equal-power') {
        fadeOut = Math.cos(t * Math.PI / 2);
        fadeIn = Math.sin(t * Math.PI / 2);
    } else {
        fadeOut = 1 - t;
        fadeIn = t;
    }
    const outIdx = midFrames + i;
    for (let ch = 0; ch < CH; ch++) {
        const tailVal = readSample(tailStart + i, ch);
        const headVal = readSample(headStart + i, ch);
        const mixed = Math.max(-32768, Math.min(32767, Math.round(tailVal * fadeOut + headVal * fadeIn)));
        out.writeInt16LE(mixed, outIdx * BYTES_PER_FRAME + ch * 2);
    }
}

// ── 3) Kontinuitäts-Check: Sprung an der neuen Loop-Naht vs. typischer Sample-Sprung ──
function frameDelta(bufA, idxA, bufB, idxB) {
    let sum = 0;
    for (let ch = 0; ch < CH; ch++) {
        sum += Math.abs(bufA.readInt16LE(idxA * BYTES_PER_FRAME + ch * 2) - bufB.readInt16LE(idxB * BYTES_PER_FRAME + ch * 2));
    }
    return sum;
}
const wrapDelta = frameDelta(out, outFrames - 1, out, 0);
let typicalDelta = 0;
const sampleCount = 500;
const midOfMid = Math.floor(midFrames / 2);
for (let i = 0; i < sampleCount; i++) {
    typicalDelta += frameDelta(out, midOfMid + i, out, midOfMid + i + 1);
}
typicalDelta /= sampleCount;

console.log(`Naht-Sprung (Ende→Anfang): ${wrapDelta.toFixed(1)}  |  typischer Nachbar-Sprung (Mitte): ${typicalDelta.toFixed(1)}`);
if (wrapDelta > typicalDelta * 5) {
    console.warn('⚠️  Naht-Sprung ist deutlich größer als üblich — XFADE erhöhen oder START_TRIM/END_TRIM anpassen.');
} else {
    console.log('✅  Naht liegt in der üblichen Größenordnung — sollte nicht hörbar klicken.');
}

// ── 4) Als WAV zwischenspeichern, dann verlustfrei zu FLAC (kein Encoder-Delay) ──
const tmpWav = path.join(os.tmpdir(), `da_loop_out_${Date.now()}.wav`);
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + out.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);            // PCM
header.writeUInt16LE(CH, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * BYTES_PER_FRAME, 28);
header.writeUInt16LE(BYTES_PER_FRAME, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(out.length, 40);
fs.writeFileSync(tmpWav, Buffer.concat([header, out]));

execSync(`ffmpeg -y -v error -i "${tmpWav}" -c:a flac "${OUTPUT}"`);
fs.unlinkSync(tmpWav);

// ── 5) Als base64 in eine .js-Datei einbetten ─────────────────────────────────
// js/settings.js liest THEME_SONG_DATA_B64 und dekodiert sie selbst per
// decodeAudioData() (Web Audio API) — kein fetch() nötig, läuft daher auch
// unter file:// (siehe Kommentar oben).
const flacBytes = fs.readFileSync(OUTPUT);
const dataFile = path.join(__dirname, 'theme_song_data.js');
fs.writeFileSync(
    dataFile,
    `// Automatisch von audio/build_loop.js geschrieben — nicht manuell bearbeiten.\n`
    + `const THEME_SONG_DATA_B64 = "${flacBytes.toString('base64')}";\n`
);

console.log(`\nFertig: ${OUTPUT} (${(outFrames / SR).toFixed(2)}s) + ${dataFile}`);
