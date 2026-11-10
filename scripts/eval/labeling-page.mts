import type { LabelingItem, LabelingPersona } from "./labeling-items.mts";

export type LabelingMode = "label" | "retest";

export interface LabelingPageInput {
  readonly mode: LabelingMode;
  readonly snapshotId: string;
  readonly personas: readonly LabelingPersona[];
  readonly items: readonly LabelingItem[];
}

export const EXPORT_NAMES: Record<LabelingMode, string> = {
  label: "labels.json",
  retest: "labels-retest.json",
};

const HEADINGS: Record<LabelingMode, string> = {
  label: "Etiquetado de encaje",
  retest: "Re-etiquetado: no mires tus respuestas anteriores",
};

const STYLE = `
:root { color-scheme: light dark; --bg: #f6f6f4; --card: #ffffff; --text: #1d1d1b; --muted: #66665f; --line: #d9d9d2; --accent: #2457c5; --accent-text: #ffffff; --done: #2f7d4f; }
@media (prefers-color-scheme: dark) { :root { --bg: #151514; --card: #1f1f1d; --text: #ecece8; --muted: #9a9a92; --line: #34342f; --accent: #6b95f0; --accent-text: #0b1020; --done: #5bbf84; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, sans-serif; }
header { position: sticky; top: 0; z-index: 1; background: var(--bg); border-bottom: 1px solid var(--line); padding: 12px 16px; }
.row { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.bar { height: 6px; background: var(--line); border-radius: 3px; margin-top: 8px; overflow: hidden; }
#bar-fill { height: 100%; width: 0; background: var(--done); }
main { max-width: 780px; margin: 0 auto; padding: 16px; display: grid; gap: 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; }
.muted { color: var(--muted); font-size: 14px; }
h1 { font-size: 20px; margin: 0 0 4px; }
pre { white-space: pre-wrap; word-wrap: break-word; font: inherit; margin: 12px 0 0; }
#notice { margin-top: 8px; padding: 8px 12px; border-radius: 8px; background: #fff3cd; color: #5c4300; font-size: 14px; }
.buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }
button { font: inherit; color: inherit; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; cursor: pointer; text-align: left; }
button:hover:not(:disabled) { border-color: var(--accent); }
button:disabled { opacity: 0.45; cursor: not-allowed; }
button.selected { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
button small { display: block; opacity: 0.8; font-size: 13px; }
kbd { border: 1px solid currentColor; border-radius: 4px; padding: 0 5px; margin-right: 6px; font-size: 13px; }
a { color: var(--accent); }
details summary { cursor: pointer; }
`;

const SCRIPT = `
const data = JSON.parse(document.getElementById("data").textContent);
const items = data.items;
const personas = new Map(data.personas.map((persona) => [persona.id, persona]));
const storageKey = "radar-eval:" + data.mode + ":" + data.snapshotId;
const element = (id) => document.getElementById(id);
let storageWorks = true;

function readAnswers() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? {} : JSON.parse(raw);
  } catch (error) {
    storageWorks = false;
    return {};
  }
}

const answers = readAnswers();
const idOf = (item) => item.persona + "|" + item.offerKey;
const answeredCount = () => items.filter((item) => answers[idOf(item)] !== undefined).length;
const firstPending = items.findIndex((item) => answers[idOf(item)] === undefined);
let index = firstPending === -1 ? items.length : firstPending;

function showNotice() {
  element("notice").hidden = storageWorks;
}

function persist() {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(answers));
  } catch (error) {
    storageWorks = false;
  }
  showNotice();
}

function render() {
  const answered = answeredCount();
  const finished = index >= items.length;
  element("progress").textContent = answered + " / " + items.length + " etiquetadas";
  element("bar-fill").style.width = (items.length === 0 ? 100 : (answered / items.length) * 100) + "%";
  element("export").disabled = items.length === 0 || answered !== items.length;
  element("previous").disabled = index === 0;
  element("next").disabled = finished;
  element("finished").hidden = !finished;
  for (const id of ["persona", "offer", "answer"]) {
    element(id).hidden = finished;
  }
  showNotice();
  if (finished) {
    element("finished-text").textContent =
      answered === items.length
        ? "Etiquetaste todo. Exportá el archivo y guardalo como eval/" + data.exportName + "."
        : "Quedan ofertas sin etiquetar. Usá Anterior para volver.";
    return;
  }

  const item = items[index];
  const persona = personas.get(item.persona);
  const sameGroup = items.filter((other) => other.persona === item.persona);
  const position = sameGroup.indexOf(item) + 1;

  element("persona-label").textContent = persona ? persona.label : item.persona;
  element("persona-position").textContent = "Oferta " + position + " de " + sameGroup.length + " para esta persona";
  element("persona-meta").textContent = persona
    ? "Seniority: " + (persona.seniority ?? "n/d") + " · Años: " + (persona.yearsOfExperience ?? "n/d") + " · Roles: " + persona.targetRoles.join(", ")
    : "";
  element("persona-skills").textContent = persona ? "Habilidades: " + persona.skills.join(", ") : "";
  element("persona-cv").textContent = persona ? persona.cvText : "";

  element("offer-title").textContent = item.title === "" ? "(sin título)" : item.title;
  element("offer-meta").textContent =
    (item.company === null ? "Empresa no indicada" : item.company) + " · " + (item.postedAt === null ? "sin fecha" : item.postedAt.slice(0, 10));
  const link = element("offer-link");
  const safe = /^https?:\\/\\//i.test(item.url);
  link.hidden = !safe;
  if (safe) {
    link.href = item.url;
  }
  element("offer-description").textContent = item.description === "" ? "(sin descripción)" : item.description;

  const current = answers[idOf(item)];
  for (const button of document.querySelectorAll("[data-band]")) {
    button.classList.toggle("selected", current === Number(button.dataset.band));
  }
  window.scrollTo(0, 0);
}

function answer(band) {
  if (index >= items.length) {
    return;
  }
  answers[idOf(items[index])] = band;
  persist();
  index += 1;
  render();
}

function move(step) {
  index = Math.min(items.length, Math.max(0, index + step));
  render();
}

function exportLabels() {
  const labels = items
    .map((item) => ({
      persona: item.persona,
      offerKey: item.offerKey,
      contentHash: item.contentHash,
      title: item.title,
      company: item.company,
      url: item.url,
      band: answers[idOf(item)],
    }))
    .sort((first, second) => {
      const left = first.persona + "|" + first.offerKey;
      const right = second.persona + "|" + second.offerKey;
      return left < right ? -1 : left > right ? 1 : 0;
    });
  const text = JSON.stringify({ snapshotId: data.snapshotId, labels: labels }, null, 2) + String.fromCharCode(10);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = data.exportName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

for (const button of document.querySelectorAll("[data-band]")) {
  button.addEventListener("click", () => answer(Number(button.dataset.band)));
}
element("previous").addEventListener("click", () => move(-1));
element("next").addEventListener("click", () => move(1));
element("back-to-last").addEventListener("click", () => move(-1));
element("export").addEventListener("click", exportLabels);
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  if (event.key >= "0" && event.key <= "3") {
    answer(Number(event.key));
  } else if (event.key === "ArrowLeft") {
    move(-1);
  } else if (event.key === "ArrowRight") {
    move(1);
  }
});
element("heading").textContent = data.heading;
render();
`;

function embed(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildLabelingPage(input: LabelingPageInput): string {
  const payload = {
    mode: input.mode,
    snapshotId: input.snapshotId,
    heading: HEADINGS[input.mode],
    exportName: EXPORT_NAMES[input.mode],
    personas: input.personas,
    items: input.items,
  };
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Radar de ofertas · etiquetado</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <div class="row">
    <strong id="heading"></strong>
    <span id="progress" class="muted"></span>
    <span>
      <button type="button" id="previous">Anterior</button>
      <button type="button" id="next">Siguiente</button>
      <button type="button" id="export">Exportar</button>
    </span>
  </div>
  <div class="bar"><div id="bar-fill"></div></div>
  <div id="notice" hidden>Este navegador no permite guardar el progreso. Exportá antes de cerrar la pestaña.</div>
</header>
<main>
  <section id="persona" class="card">
    <strong id="persona-label"></strong>
    <div id="persona-position" class="muted"></div>
    <div id="persona-meta" class="muted"></div>
    <div id="persona-skills" class="muted"></div>
    <details><summary class="muted">Texto del CV</summary><pre id="persona-cv"></pre></details>
  </section>
  <section id="offer" class="card">
    <h1 id="offer-title"></h1>
    <div id="offer-meta" class="muted"></div>
    <a id="offer-link" target="_blank" rel="noopener noreferrer">Abrir la oferta original</a>
    <pre id="offer-description"></pre>
  </section>
  <section id="answer" class="card">
    <div class="buttons">
      <button type="button" data-band="0"><kbd>0</kbd>No encaja<small>Otro rubro, o pide habilidades que no tiene</small></button>
      <button type="button" data-band="1"><kbd>1</kbd>Parcial<small>Coinciden algunas habilidades, pero faltan requisitos importantes o el seniority es claramente otro</small></button>
      <button type="button" data-band="2"><kbd>2</kbd>Bueno<small>Coinciden casi todas las habilidades; huecos chicos de habilidades o de seniority</small></button>
      <button type="button" data-band="3"><kbd>3</kbd>Muy bueno<small>Pide sus habilidades principales y un seniority acorde</small></button>
    </div>
  </section>
  <section id="finished" class="card" hidden>
    <p id="finished-text"></p>
    <button type="button" id="back-to-last">Volver a la última</button>
  </section>
</main>
<script type="application/json" id="data">${embed(payload)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
