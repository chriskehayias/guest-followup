// DOM only: wires the page to the pure logic in src/lib.
// Guest data is untrusted input, so every value reaches the page through
// textContent (via el()) — never innerHTML — which rules out script injection.

import './style.css';
import { fetchLatestUpload, saveUpload } from './api.ts';
import { processGuestCsv, processGuestRecords } from './lib/pipeline.ts';
import { formatVisitDate } from './lib/dates.ts';
import { followUpFileName, toFollowUpCsv } from './lib/exportCsv.ts';
import type { BoardResult, ColumnMapping, ColumnName, GuestRecord, GuestRow, Household, Summary } from './lib/types.ts';

// ---------- small helpers ----------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

const val = (record: GuestRecord, column: ColumnName): string => record[column] ?? '';
const isBlank = (value: string): boolean => value.trim() === '';
const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// ---------- page shell ----------

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app element');

const header = el('header', 'app-header');
const headerInner = el('div', 'app-header-inner');
headerInner.append(
  el('h1', 'app-title', 'Guest Follow-Up Board'),
  el('p', 'app-subtitle', 'Drop a first-time guest export, see each household once, and download a clean follow-up list.'),
);
header.append(headerInner);

const main = el('main', 'app-main');

const dropZone = el('section', 'dropzone');
dropZone.setAttribute('aria-labelledby', 'dropzone-title');
const dzTitle = el('h2', 'dropzone-title', 'Drop your guest CSV here');
dzTitle.id = 'dropzone-title';
const dzHint = el('p', 'dropzone-hint', 'Export first-time guests from your church system as a .csv file, then drag it onto this box.');
const chooseBtn = el('button', 'btn btn-dark', 'Choose CSV file');
chooseBtn.type = 'button';
const fileInput = el('input');
fileInput.type = 'file';
fileInput.accept = '.csv,text/csv';
fileInput.hidden = true;
dropZone.append(dzTitle, dzHint, chooseBtn);

const privacy = el('p', 'privacy', 'Each upload is saved to the board’s database, and the latest one reloads when you open this page.');

const toolbar = el('div', 'toolbar');
const status = el('p', 'status', 'No file loaded yet.');
status.dataset.state = 'idle';
status.setAttribute('role', 'status');
status.setAttribute('aria-live', 'polite');
const saveNote = el('p', 'save-note');
saveNote.setAttribute('aria-live', 'polite');
const statusArea = el('div', 'status-area');
statusArea.append(status, saveNote);
const downloadArea = el('div', 'download');
const downloadNote = el('span', 'download-note');
downloadNote.setAttribute('aria-live', 'polite');
const downloadBtn = el('button', 'btn btn-primary', 'Download follow-up CSV');
downloadBtn.type = 'button';
downloadBtn.disabled = true;
downloadArea.append(downloadNote, downloadBtn);
toolbar.append(statusArea, downloadArea);

const results = el('div', 'results');

main.append(fileInput, dropZone, privacy, toolbar, results);
app.replaceChildren(header, main);

// ---------- state ----------

let current: BoardResult | null = null;
let loadSeq = 0; // ignores a slow load if a newer file was dropped meanwhile
let saveQueue = Promise.resolve(); // saves run one at a time, so the newest upload is saved last

type StatusState = 'idle' | 'busy' | 'ok' | 'error';

function setStatus(state: StatusState, ...parts: (string | Node)[]): void {
  status.dataset.state = state;
  status.replaceChildren(...parts);
}

function setSaveNote(text: string, isError = false): void {
  saveNote.textContent = text;
  saveNote.classList.toggle('is-error', isError);
}

function setCompact(compact: boolean): void {
  dropZone.classList.toggle('is-compact', compact);
  dzTitle.textContent = compact ? 'Drop a different CSV here' : 'Drop your guest CSV here';
  dzHint.hidden = compact;
  chooseBtn.textContent = compact ? 'Choose a different file' : 'Choose CSV file';
}

// ---------- loading ----------

function looksLikeCsv(file: File): boolean {
  return /\.csv$/i.test(file.name) || file.type === 'text/csv';
}

async function loadFile(file: File): Promise<void> {
  const seq = ++loadSeq;
  current = null;
  downloadBtn.disabled = true;
  downloadNote.textContent = '';
  setSaveNote('');
  results.replaceChildren();
  setStatus('busy', 'Reading ', el('strong', '', file.name), '…');

  if (!looksLikeCsv(file)) {
    showLoadError(
      file.name,
      'That doesn’t look like a CSV file. In your church system or spreadsheet app, export or “Save as” CSV, then try again.',
    );
    return;
  }

  try {
    const text = await file.text();
    if (seq !== loadSeq) return;
    const result = processGuestCsv(text);
    renderResult(file.name, result);
    if (result.rows.length > 0) void saveToDatabase(seq, file.name, result);
  } catch (err) {
    if (seq !== loadSeq) return;
    showLoadError(file.name, `Something went wrong while reading this file: ${errorMessage(err)}`);
  }
}

async function saveToDatabase(seq: number, fileName: string, result: BoardResult): Promise<void> {
  setSaveNote('Saving to the database…');
  const save = saveQueue.then(() => saveUpload(fileName, result.rows.map((row) => row.original)));
  saveQueue = save.catch(() => undefined);
  try {
    await save;
    if (seq === loadSeq) setSaveNote('Saved to the database.');
  } catch (err) {
    if (seq === loadSeq) setSaveNote(`Not saved to the database: ${errorMessage(err)}`, true);
  }
}

/** On page open: shows the most recently saved upload, unless a file is dropped first. */
async function loadSaved(): Promise<void> {
  const seq = ++loadSeq;
  setStatus('busy', 'Loading the last saved guest list…');
  try {
    const saved = await fetchLatestUpload();
    if (seq !== loadSeq) return;
    if (!saved) {
      setStatus('idle', 'No file loaded yet.');
      return;
    }
    renderResult(saved.fileName, processGuestRecords(saved.records));
    setSaveNote(`Loaded from the database · uploaded ${formatUploadedAt(saved.uploadedAt)}.`);
  } catch (err) {
    if (seq !== loadSeq) return;
    setStatus('idle', 'No file loaded yet.');
    setSaveNote(`Couldn’t load the saved guest list: ${errorMessage(err)}`, true);
  }
}

/** A full UTC timestamp from our server (not a visit date), shown in local time. */
function formatUploadedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function showLoadError(fileName: string, message: string): void {
  current = null;
  downloadBtn.disabled = true;
  setCompact(false);
  results.replaceChildren(notice('error', `Couldn’t load ${fileName}`, message));
  setStatus('error', 'Couldn’t load ', el('strong', '', fileName), '.');
}

function renderResult(fileName: string, result: BoardResult): void {
  const notices = columnNotices(result.mapping, result.parseErrors);

  if (result.rows.length === 0) {
    current = null;
    downloadBtn.disabled = true;
    setCompact(false);
    results.replaceChildren(
      notice(
        'error',
        'No guest rows found',
        `We couldn’t find any guests in ${fileName}. Check that it’s a CSV export with a header row (First Name, Last Name, Visit Date, …) and at least one guest below it.`,
      ),
      ...notices,
    );
    setStatus('error', el('strong', '', fileName), ' · no guest rows found.');
    return;
  }

  const frag = document.createDocumentFragment();
  frag.append(...notices, renderSummary(result.summary), renderTable(fileName, result.households));
  results.replaceChildren(frag);

  current = result;
  downloadBtn.disabled = false;
  setCompact(true);
  const s = result.summary;
  setStatus(
    'ok',
    el('strong', '', fileName),
    ` · ${plural(s.rowsLoaded, 'row')} loaded · ${plural(s.households, 'household')}`,
    result.mapping.missingRequired.length > 0 ? ' · see the warning below.' : '.',
  );
}

// ---------- notices (R2) ----------

function notice(kind: 'error' | 'warning' | 'info', title: string, ...body: (string | Node)[]): HTMLElement {
  const box = el('div', `notice notice-${kind}`);
  box.append(el('p', 'notice-title', title));
  for (const part of body) box.append(typeof part === 'string' ? el('p', 'notice-body', part) : part);
  return box;
}

function columnNotices(mapping: ColumnMapping, parseErrors: string[]): HTMLElement[] {
  const out: HTMLElement[] = [];

  if (mapping.missingRequired.length > 0) {
    out.push(
      notice(
        'warning',
        `Missing required ${mapping.missingRequired.length === 1 ? 'column' : 'columns'}: ${mapping.missingRequired.join(', ')}`,
        'Rows still load, but names or visit dates will be blank. Check the header row in your export.',
      ),
    );
  }

  const otherMissing = mapping.missing.filter((c) => !mapping.missingRequired.includes(c));
  const lines: string[] = [];
  if (otherMissing.length > 0) lines.push(`Not in this file (left blank): ${otherMissing.join(', ')}.`);
  if (mapping.extra.length > 0) {
    const names = mapping.extra.map((h) => (isBlank(h) ? '(unnamed column)' : h));
    lines.push(`Extra columns ignored: ${names.join(', ')}.`);
  }
  if (lines.length > 0) out.push(notice('info', 'Column notes', ...lines));

  if (parseErrors.length > 0) {
    const shown = 5;
    const list = el('ul', 'notice-list');
    for (const message of parseErrors.slice(0, shown)) list.append(el('li', '', message));
    const extra = parseErrors.length > shown ? [`…and ${plural(parseErrors.length - shown, 'more problem')}.`] : [];
    out.push(
      notice(
        'warning',
        `${plural(parseErrors.length, 'line')} couldn’t be read cleanly`,
        'The rest of the file loaded normally. Check these lines in the export:',
        list,
        ...extra,
      ),
    );
  }

  return out;
}

// ---------- summary bar (R6) ----------

function renderSummary(s: Summary): HTMLElement {
  const section = el('section', 'summary');
  section.setAttribute('aria-label', 'Summary');
  const tiles = el('dl', 'tiles');

  const issueParts: string[] = [];
  if (s.invalidDates > 0) issueParts.push(plural(s.invalidDates, 'invalid date'));
  if (s.noContact > 0) issueParts.push(`${s.noContact.toLocaleString()} no contact`);

  tiles.append(
    tile('Rows loaded', s.rowsLoaded),
    tile('Households', s.households),
    tile(
      'Duplicate groups',
      s.duplicateGroups,
      s.duplicateGroups > 0 ? plural(s.duplicateRows, 'row') : 'None found',
      s.duplicateGroups > 0 ? 'tile-accent' : '',
    ),
    tile('Rows with issues', s.rowsWithIssues, issueParts.join(' · ') || 'None found', s.rowsWithIssues > 0 ? 'tile-alert' : ''),
  );
  section.append(tiles);
  return section;
}

function tile(label: string, value: number, sub?: string, modifier = ''): HTMLElement {
  const box = el('div', `tile ${modifier}`.trim());
  box.append(el('dt', 'tile-label', label), el('dd', 'tile-value', value.toLocaleString()));
  if (sub) box.append(el('dd', 'tile-sub', sub));
  return box;
}

// ---------- households table (R3/R4/R5) ----------

const HEADERS = ['Name', 'Email', 'Phone', 'Address', 'Visit dates', 'Service', 'Party', 'Flags'];

function renderTable(fileName: string, households: Household[]): HTMLElement {
  const wrap = el('div', 'table-wrap');
  wrap.tabIndex = 0; // lets keyboard users scroll the table
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', 'Households table');

  const table = el('table', 'households');
  const caption = el('caption');
  caption.append(
    el('span', 'caption-title', 'Households'),
    el(
      'span',
      'caption-sub',
      `${plural(households.length, 'household')} from ${fileName}, in the order they first appear. Duplicate groups list each original row underneath.`,
    ),
  );

  const headRow = el('tr');
  for (const label of HEADERS) {
    const th = el('th', '', label);
    th.scope = 'col';
    headRow.append(th);
  }
  const thead = el('thead');
  thead.append(headRow);

  const frag = document.createDocumentFragment();
  for (const household of households) {
    frag.append(householdRow(household));
    if (household.rows.length > 1) {
      for (const row of household.rows) frag.append(memberRow(row, row === household.primary));
    }
  }
  const tbody = el('tbody');
  tbody.append(frag);

  table.append(caption, thead, tbody);
  wrap.append(table);
  return wrap;
}

function householdRow(h: Household): HTMLTableRowElement {
  const p = h.primary.original;
  const isGroup = h.rows.length > 1;
  const tr = el('tr', isGroup ? 'household is-group' : 'household');

  const nameCell = el('th', 'name');
  nameCell.scope = 'row';
  nameCell.append(textOrBlank(fullName(p), '(no name)'));
  if (isGroup) nameCell.append(el('span', 'group-count', `${h.rows.length} rows merged`));

  tr.append(
    nameCell,
    cell(firstNonBlank(h.rows, 'Email')),
    cell(firstNonBlank(h.rows, 'Phone')),
    cell(addressText(p)),
    datesCell(h.rows),
    cell(val(p, 'Service')),
    cell(partyText(p)),
    flagsCell(h),
  );
  return tr;
}

/** One original input row of a duplicate group, values shown verbatim. */
function memberRow(row: GuestRow, isPrimary: boolean): HTMLTableRowElement {
  const o = row.original;
  const tr = el('tr', 'member');

  const nameCell = el('td', 'name member-name');
  nameCell.append(el('span', 'row-ref', `Row ${row.index + 2}`), verbatim(val(o, 'First Name')), ' ', verbatim(val(o, 'Last Name')));

  const dateCell = el('td', 'dates');
  dateCell.append(dateSpan(row, val(o, 'Visit Date')));

  const noteCell = el('td', 'flags');
  if (isPrimary) noteCell.append(el('span', 'member-note', 'Earliest visit'));

  tr.append(
    nameCell,
    verbatimCell(val(o, 'Email')),
    verbatimCell(val(o, 'Phone')),
    verbatimCell(addressText(o)),
    dateCell,
    verbatimCell(val(o, 'Service')),
    cell(partyText(o)),
    noteCell,
  );
  return tr;
}

function fullName(record: GuestRecord): string {
  return [val(record, 'First Name'), val(record, 'Last Name')].map((s) => s.trim()).filter(Boolean).join(' ');
}

function firstNonBlank(rows: GuestRow[], column: ColumnName): string {
  return rows.map((r) => val(r.original, column)).find((v) => !isBlank(v)) ?? '';
}

/** "address, city, state zip" from the original values. */
function addressText(record: GuestRecord): string {
  const stateZip = [val(record, 'State'), val(record, 'Zip')].map((s) => s.trim()).filter(Boolean).join(' ');
  return [val(record, 'Address'), val(record, 'City'), stateZip].map((s) => s.trim()).filter(Boolean).join(', ');
}

/** "2 adults, 1 kid"; zero kids are left out; non-numeric values are shown as typed. */
function partyText(record: GuestRecord): string {
  const count = (raw: string, noun: string) => (/^\d+$/.test(raw) ? plural(Number(raw), noun) : `${raw} ${noun}s`);
  const adults = val(record, 'Adults').trim();
  const kids = val(record, 'Kids').trim();
  const parts: string[] = [];
  if (adults) parts.push(count(adults, 'adult'));
  if (kids && !/^0+$/.test(kids)) parts.push(count(kids, 'kid'));
  return parts.join(', ');
}

function textOrBlank(text: string, blankLabel = '—'): HTMLElement {
  if (!isBlank(text)) return el('span', '', text);
  const span = el('span', 'blank', blankLabel);
  span.title = 'Blank';
  return span;
}

function cell(text: string): HTMLTableCellElement {
  const td = el('td');
  td.append(textOrBlank(text));
  return td;
}

/** Shows a value exactly as typed; leading/trailing spaces are kept and outlined. */
function verbatim(value: string): HTMLElement {
  if (isBlank(value)) return textOrBlank(value);
  const span = el('span', 'verbatim', value);
  if (value !== value.trim()) {
    span.classList.add('has-space');
    span.title = 'Has extra spaces at the start or end';
  }
  return span;
}

function verbatimCell(value: string): HTMLTableCellElement {
  const td = el('td');
  td.append(verbatim(value));
  return td;
}

function dateSpan(row: GuestRow, raw: string): HTMLElement {
  if (row.visitDateValid) {
    const span = el('span', 'date', formatVisitDate(raw));
    span.title = raw.trim();
    return span;
  }
  const span = el('span', 'date date-invalid', isBlank(raw) ? 'No date' : raw);
  span.title = 'Not a valid visit date (expected a real YYYY-MM-DD date)';
  span.append(el('span', 'sr-only', ' (invalid)'));
  return span;
}

/** Every valid date (formatted, repeats shown once), then invalid ones as typed. */
function datesCell(rows: GuestRow[]): HTMLTableCellElement {
  const td = el('td', 'dates');
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = val(row.original, 'Visit Date');
    const key = row.visitDateValid ? formatVisitDate(raw) : `invalid:${raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    td.append(dateSpan(row, raw));
  }
  return td;
}

type BadgeKind = 'dup' | 'invalid' | 'nocontact' | 'other';

function flagsCell(h: Household): HTMLTableCellElement {
  const td = el('td', 'flags');
  // Same label twice (e.g. two invalid dates) becomes one badge listing both in its tooltip.
  const badges = new Map<string, { kind: BadgeKind; details: string[] }>();
  for (const flag of h.flags) {
    const [kind, label] = describeFlag(flag, h);
    const existing = badges.get(label);
    if (existing) existing.details.push(flag);
    else badges.set(label, { kind, details: [flag] });
  }
  for (const [label, { kind, details }] of badges) {
    const badge = el('span', `badge badge-${kind}`, label);
    badge.title = details.join('\n');
    td.append(badge);
  }
  return td;
}

function describeFlag(flag: string, h: Household): [BadgeKind, string] {
  if (flag.startsWith('Duplicate')) {
    const rules = /\(([^)]*)\)/.exec(flag)?.[1] || h.matchedBy.join(', ');
    return ['dup', rules ? `Duplicate · ${rules}` : 'Duplicate'];
  }
  if (flag.startsWith('Invalid visit date')) return ['invalid', 'Invalid date'];
  if (flag.startsWith('No contact')) return ['nocontact', 'No contact'];
  return ['other', flag];
}

// ---------- download (R7) ----------

downloadBtn.addEventListener('click', () => {
  if (!current) return;
  try {
    const fileName = followUpFileName(new Date());
    const blob = new Blob([toFollowUpCsv(current.households)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = el('a');
    link.href = url;
    link.download = fileName;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoke a moment later so every browser has started the download first.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    downloadNote.textContent = `Downloaded ${fileName} (${plural(current.households.length, 'household')}).`;
  } catch (err) {
    downloadNote.textContent = '';
    results.prepend(notice('error', 'Couldn’t create the follow-up CSV', errorMessage(err)));
  }
});

// ---------- file picker and drag-and-drop (R1) ----------

function openPicker(): void {
  fileInput.click();
}

chooseBtn.addEventListener('click', openPicker);
dropZone.addEventListener('click', (e) => {
  // Clicking anywhere in the zone opens the picker too (the button handles its own clicks).
  if (!chooseBtn.contains(e.target as Node)) openPicker();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = ''; // so choosing the same file again still triggers a load
  if (file) void loadFile(file);
});

let dragDepth = 0; // dragenter/dragleave fire for child elements too
dropZone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  dropZone.classList.add('is-dragover');
});
dropZone.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropZone.classList.remove('is-dragover');
});
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropZone.classList.remove('is-dragover');
  const file = e.dataTransfer?.files[0];
  if (file) void loadFile(file);
  else setStatus('error', 'That wasn’t a file. Drag a .csv file from your computer onto the box.');
});

// A file dropped anywhere else must not make the browser navigate away to it.
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer && !dropZone.contains(e.target as Node)) e.dataTransfer.dropEffect = 'none';
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropZone.classList.remove('is-dragover');
});

void loadSaved();
