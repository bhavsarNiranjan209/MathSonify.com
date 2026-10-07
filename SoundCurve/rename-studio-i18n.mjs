// One-shot: standardize the Studio product name across all translation files.
// Each entry is [oldValueSubstring, newValue] applied to that file only.
// The script throws if an expected old value is not found, so silent misses
// cannot slip through.
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'c:/Projects(NiJo)/SoundCurve/certain-cycle/src/i18n/translations/';

const MAP = {
  ar: [
    ['افتح استوديو الصوت', 'افتح الاستوديو'],
    ['جرّبه في استوديو الصوت', 'جرّبه في الاستوديو'],
    ['استوديو الإنشاء', 'استوديو'],
  ],
  da: [
    ['Åbn lydstudiet', 'Åbn studiet'],
    ['Prøv det i lydstudiet', 'Prøv det i studiet'],
    ["'Afspil i Studie'", "'Afspil i Studio'"],
    ["'footer.creationStudio': 'Studie'", "'footer.creationStudio': 'Studio'"],
  ],
  de: [
    ['Tonstudio öffnen', 'Studio öffnen'],
    ['Im Tonstudio ausprobieren', 'Im Studio ausprobieren'],
    ['Erstellungsstudio', 'Studio'],
  ],
  es: [
    ['Abrir el Estudio de Sonido', 'Abrir el Estudio'],
    ['Abrir el estudio de sonido', 'Abrir el Estudio'],
    ['Pruébalo en el estudio de sonido', 'Pruébalo en el Estudio'],
    ['Estudio de Creación', 'Estudio'],
  ],
  fi: [
    ['Avaa Äänistudio', 'Avaa Studio'],
    ['Avaa äänistudio', 'Avaa Studio'],
    ['Kokeile äänistudiossa', 'Kokeile studiossa'],
    ['Luomisstudio', 'Studio'],
  ],
  fr: [
    ['Ouvrir le Studio Sonore', 'Ouvrir le Studio'],
    ['Ouvrir le studio sonore', 'Ouvrir le Studio'],
    ['Essayez dans le studio sonore', 'Essayez dans le Studio'],
    ['Studio de Création', 'Studio'],
  ],
  ga: [
    ['Oscail an Stiúideo Fuaime', 'Oscail an Stiúideo'],
    ['Oscail an stiúideo fuaime', 'Oscail an Stiúideo'],
    ['Bain triail as sa stiúideo fuaime', 'Bain triail as sa Stiúideo'],
    ['Stiúideo Cruthaithe', 'Stiúideo'],
  ],
  it: [
    ['Apri lo Studio Sonoro', 'Apri lo Studio'],
    ['Apri lo studio sonoro', 'Apri lo Studio'],
    ['Provalo nello studio sonoro', 'Provalo nello Studio'],
    ['Studio di Creazione', 'Studio'],
  ],
  ja: [
    ['サウンドスタジオを開く', 'スタジオを開く'],
    ['サウンドスタジオで試す', 'スタジオで試す'],
    ['クリエーションスタジオ', 'スタジオ'],
  ],
  ko: [
    ['사운드 스튜디오 열기', '스튜디오 열기'],
    ['사운드 스튜디오에서 체험', '스튜디오에서 체험'],
    ['크리에이션 스튜디오', '스튜디오'],
  ],
  lb: [
    ['Tounstudio opmaachen', 'Studio opmaachen'],
    ['Probéiert et am Tounstudio', 'Probéiert et am Studio'],
    ['Kreativstudio', 'Studio'],
  ],
  mi: [
    ['Whakatuwheratia te Taiwhanga Oro', 'Whakatuwheratia te Taiwhanga'],
    ['Whakatuwheratia te taiwhanga oro', 'Whakatuwheratia te taiwhanga'],
    ['Whakamātauria i te taiwhanga oro', 'Whakamātauria i te taiwhanga'],
    ['Taiwhanga Waihanga', 'Studio'],
  ],
  ms: [
    ['Buka Studio Bunyi', 'Buka Studio'],
    ['Buka studio bunyi', 'Buka Studio'],
    ['Cubanya di studio bunyi', 'Cubanya di Studio'],
    ['Studio Penciptaan', 'Studio'],
  ],
  nl: [
    ['Open de Geluidsstudio', 'Open de Studio'],
    ['Open de geluidsstudio', 'Open de Studio'],
    ['Probeer het in de geluidsstudio', 'Probeer het in de Studio'],
    ['Creatiestudio', 'Studio'],
  ],
  no: [
    ['Åpne lydstudioet', 'Åpne studioet'],
    ['Prøv det i lydstudioet', 'Prøv det i studioet'],
  ],
  pt: [
    ['Abrir o Estúdio de Som', 'Abrir o Estúdio'],
    ['Abrir o estúdio de som', 'Abrir o Estúdio'],
    ['Experimente no estúdio de som', 'Experimente no Estúdio'],
    ['Estúdio de Criação', 'Estúdio'],
  ],
  sv: [
    ['Öppna Ljudstudion', 'Öppna Studion'],
    ['Öppna ljudstudion', 'Öppna Studion'],
    ['Prova i ljudstudion', 'Prova i Studion'],
    ['Skaparstudio', 'Studio'],
  ],
  ta: [
    ['ஒலி ஸ்டுடியோவைத் திறக்கவும்', 'ஸ்டுடியோவைத் திறக்கவும்'],
    ['ஒலி ஸ்டுடியோவில் முயற்சிக்கவும்', 'ஸ்டுடியோவில் முயற்சிக்கவும்'],
    ['உருவாக்க ஸ்டுடியோ', 'ஸ்டுடியோ'],
  ],
  zh: [
    ['打开声音工作室', '打开工作室'],
    ['在声音工作室中试试', '在工作室中试试'],
    ['创作工作室', '工作室'],
  ],
};

let failures = [];
for (const [lang, pairs] of Object.entries(MAP)) {
  const path = `${BASE}${lang}.ts`;
  let text = readFileSync(path, 'utf8');
  for (const [oldStr, newStr] of pairs) {
    if (!text.includes(oldStr)) {
      failures.push(`${lang}.ts: missing "${oldStr}"`);
      continue;
    }
    text = text.split(oldStr).join(newStr);
  }
  writeFileSync(path, text, 'utf8');
  console.log(`updated ${lang}.ts`);
}
if (failures.length) {
  console.error('FAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('all translation files updated');
