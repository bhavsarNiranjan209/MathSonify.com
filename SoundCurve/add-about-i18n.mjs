// One-shot: About-page restructure i18n parity.
// For each non-English translation:
//   1. Soften `about.tag` ("project manifesto" → "about this project")
//   2. Insert the three new About keys (builderTitle, builderDesc, underHood)
//      before `about.techTitle` to match the en.ts ordering.
// Throws at the end if any expected anchor was missing, so silent misses
// cannot slip through.
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'c:/Projects(NiJo)/SoundCurve/certain-cycle/src/i18n/translations/';

// lang: [oldTag, newTag, builderTitle, builderDesc, underHood]
const MAP = {
  ar: [
    'بيان المشروع',
    'عن هذا المشروع',
    'من يبني MathSonify',
    'يُصمَّم MathSonify ويُطوَّر ويُصان بواسطة فريق صغير متفانٍ. بدأ كسؤال بسيط — ماذا يبدو صوت المعادلة فعليًا؟ — وما زال يتشكّل بفعل المستخدمين له.',
    'تحت الغطاء',
  ],
  da: [
    'projektmanifest',
    'om dette projekt',
    'Hvem bygger MathSonify',
    'MathSonify designes, bygges og vedligeholdes af et lille, dedikeret team. Det begyndte som et enkelt spørgsmål — hvordan lyder en ligning egentlig? — og det formes stadig af dem, der bruger det.',
    'under motorhjelmen',
  ],
  de: [
    'Projektmanifest',
    'über dieses Projekt',
    'Wer baut MathSonify',
    'MathSonify wird von einem kleinen, engagierten Team entworfen, gebaut und betreut. Es begann als einfache Frage — wie klingt eine Gleichung eigentlich? — und wird noch immer von den Menschen geprägt, die es nutzen.',
    'unter der Haube',
  ],
  es: [
    'manifiesto del proyecto',
    'sobre este proyecto',
    'Quién crea MathSonify',
    'MathSonify lo diseñan, construyen y mantienen un pequeño equipo dedicado. Nació de una pregunta sencilla — ¿a qué suena realmente una ecuación? — y sigue moldeándose con la gente que lo usa.',
    'bajo el capó',
  ],
  fi: [
    'projektin manifesti',
    'tietoa tästä projektista',
    'Kuka rakentaa MathSonifyn',
    'MathSonifya suunnittelee, rakentaa ja ylläpitää pieni, omistautunut tiimi. Se alkoi yksinkertaisesta kysymyksestä — miltä kaava oikeasti kuulostaa? — ja sitä muokkaavat yhä sen käyttäjät.',
    'kannen alla',
  ],
  fr: [
    'manifeste du projet',
    'à propos de ce projet',
    'Qui construit MathSonify',
    'MathSonify est conçu, développé et entretenu par une petite équipe passionnée. Tout a commencé par une simple question — à quoi ressemble vraiment une équation ? — et il est encore façonné par les personnes qui l’utilisent.',
    'sous le capot',
  ],
  ga: [
    'forógra tionscadail',
    'faoi an tionscadal seo',
    'Cé a thógann MathSonify',
    'Dearnaíonn, thóg agus coinníonn foireann bheag díograiseach MathSonify. Thosaigh sé le ceist shimplí — céard é fuaim na cothromóide i ndáiríre? — agus tá sé fós á mhúniú ag na daoine a úsáideann é.',
    'faoi an mbonn',
  ],
  it: [
    'manifesto del progetto',
    'su questo progetto',
    'Chi costruisce MathSonify',
    'MathSonify è progettato, costruito e mantenuto da un piccolo team dedicato. È nato da una domanda semplice — cosa suona davvero un’equazione? — e continua a essere plasmato dalle persone che lo usano.',
    'sotto il cofano',
  ],
  ja: [
    'プロジェクト宣言',
    'このプロジェクトについて',
    'MathSonifyを作る人々',
    'MathSonifyは、少数の専念深いチームが設計・開発・運営しています。出発点はシンプルな問いでした——方程式は実際にはどう聞こえるのか？——今も利用する人々によって形を変え続けています。',
    '内部の仕組み',
  ],
  ko: [
    '프로젝트 선언문',
    '이 프로젝트에 대해',
    'MathSonify를 만드는 사람들',
    'MathSonify는 소규모의 전담팀이 설계하고 개발하며 운영합니다. 시작은 단순한 질문이었습니다 — 방정식은 실제로 어떻게 들릴까요? — 지금도 사용하는 사람들이 만들어갑니다.',
    '내부 구조',
  ],
  lb: [
    'Projetmanifest',
    'iwwer dëst Projet',
    'Wien baut MathSonify',
    'MathSonify gëtt vun engem klengen, motivéierte Team entwéckelt an ënnerhalen. Et huet ugefaang mat enger einfacher Fro: wéi kléngt eng Gläichung eigentlech? — a gëtt nachëmmer vun de Leit geprägt, déi et benotzen.',
    'ënner der Haube',
  ],
  mi: [
    'kupu whakapuaki kaupapa',
    'mō tēnei kaupapa',
    'Ko wai te kaihanganga o MathSonify',
    'He tīma iti, he ngaukai e hoahoa, e hanga, e tiaki i te MathSonify. I tīmata mai i tētahi pātai simple: he aha te oro o tētahi pātai? — ā, e āhua tonu ana e āhuatia ana i ngā kaiwhakamahi.',
    'i raro i te papa',
  ],
  ms: [
    'manifesto projek',
    'tentang projek ini',
    'Siapa yang membina MathSonify',
    'MathSonify direka, dibina dan diselenggara oleh sebuah pasukan kecil yang dedikasi. Ia bermula dengan satu soalan mudah — bunyi sebenarnya bagaimanakah sebuah persamaan? — dan masih dibentuk oleh orang yang menggunakannya.',
    'di sebalik tabir',
  ],
  nl: [
    'projectmanifest',
    'over dit project',
    'Wie bouwt MathSonify',
    'MathSonify wordt ontworpen, gebouwd en onderhouden door een klein, toegewijd team. Het begon als een simpele vraag — hoe klinkt een vergelijking eigenlijk? — en wordt nog steeds gevormd door de mensen die het gebruiken.',
    'onder de motorkap',
  ],
  no: [
    'prosjektmanifest',
    'om dette prosjektet',
    'Hvem bygger MathSonify',
    'MathSonify utformes, bygges og vedlikeholdes av et lite, dedikert team. Det startet som et enkelt spørsmål — hvordan høres en ligning egentlig ut? — og formes fortsatt av folkene som bruker det.',
    'under panseret',
  ],
  pt: [
    'manifesto do projeto',
    'sobre este projeto',
    'Quem cria o MathSonify',
    'O MathSonify é projetado, construído e mantido por uma pequena equipe dedicada. Começou com uma pergunta simples — como soa realmente uma equação? — e continua a ser moldado pelas pessoas que o utilizam.',
    'sob o capô',
  ],
  sv: [
    'projektmanifest',
    'om det här projektet',
    'Vem bygger MathSonify',
    'MathSonify formas, byggs och underhålls av ett litet, engagerat team. Det började som en enkel fråga — hur låter en ekvation egentligen? — och formas fortfarande av dem som använder det.',
    'under motorhuven',
  ],
  ta: [
    'திட்ட அறிக்கை',
    'இந்தத் திட்டத்தைப் பற்றி',
    'MathSonify-ஐ உருவாக்குபவர்கள்',
    'MathSonify-ஐ சிறிய, அர்ப்பணிப்புமிக்க குழுவே வடிவமைத்து, உருவாக்கி, பராமரிக்கிறது. ஒரு எளியக் கேள்வியில் இது தொடங்கியது — ஒரு சமன்பாடு உண்மையில் எப்படி ஒலிக்கிறது? — பயன்படுத்துபவர்களால் இன்றும் இது வடிவமைக்கப்படுகிறது.',
    'மேலோட்டின் கீழே',
  ],
  zh: [
    '项目宣言',
    '关于这个项目',
    '谁在打造 MathSonify',
    'MathSonify 由一支专注的小团队设计、开发和维护。它始于一个简单的问题——一个方程听起来究竟是什么样子？——至今仍在使用它的人们的反馈中不断成形。',
    '内部构造',
  ],
};

const failures = [];
for (const [lang, [oldTag, newTag, builderTitle, builderDesc, underHood]] of Object.entries(MAP)) {
  const path = `${BASE}${lang}.ts`;
  let text = readFileSync(path, 'utf8');

  const tagLine = `'about.tag': '${oldTag}'`;
  if (!text.includes(tagLine)) {
    failures.push(`${lang}.ts: missing about.tag value "${oldTag}"`);
  } else {
    text = text.replace(tagLine, `'about.tag': '${newTag}'`);
  }

  const anchor = "  'about.techTitle'";
  const idx = text.indexOf(anchor);
  if (idx === -1) {
    failures.push(`${lang}.ts: missing about.techTitle anchor`);
  } else if (text.includes("'about.underHood'")) {
    failures.push(`${lang}.ts: about.underHood already present (refusing to double-insert)`);
  } else {
    const insert =
      `  'about.builderTitle': '${builderTitle}',\n` +
      `  'about.builderDesc': '${builderDesc}',\n` +
      `  'about.underHood': '${underHood}',\n`;
    text = text.slice(0, idx) + insert + text.slice(idx);
  }

  writeFileSync(path, text, 'utf8');
  console.log(`updated ${lang}.ts`);
}

if (failures.length) {
  console.error('FAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('all 19 translation files updated');
