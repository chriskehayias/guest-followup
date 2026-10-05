// Household grouping: rows sharing any normalized key end up together (matches chain).

import { MATCH_RULES } from './types.ts';
import type { GuestRow, Household, MatchKeys, MatchRule, Summary } from './types.ts';
import { compareVisitDates } from './dates.ts';

const KEY_FOR_RULE: Record<MatchRule, keyof MatchKeys> = {
  email: 'email',
  phone: 'phone',
  'name + address': 'nameAddress',
};

const NO_CONTACT_FLAG = 'No contact info';

/** Union-find over row positions that also tracks which rules joined each set. */
class DisjointSets {
  private readonly parent: number[];
  private readonly size: number[];
  private readonly rules: Set<MatchRule>[];

  constructor(count: number) {
    this.parent = Array.from({ length: count }, (_, i) => i);
    this.size = new Array<number>(count).fill(1);
    this.rules = Array.from({ length: count }, () => new Set<MatchRule>());
  }

  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[i] !== root) {
      const next = this.parent[i];
      this.parent[i] = root;
      i = next;
    }
    return root;
  }

  /** Joins the sets containing a and b; the rule is recorded only if they were separate. */
  union(a: number, b: number, rule: MatchRule): void {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return;
    if (this.size[ra] < this.size[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    this.size[ra] += this.size[rb];
    for (const r of this.rules[rb]) this.rules[ra].add(r);
    this.rules[ra].add(rule);
  }

  rulesOf(i: number): Set<MatchRule> {
    return this.rules[this.find(i)];
  }
}

/** Groups rows into households by email, then phone, then name + address. O(n α(n)). */
export function groupHouseholds(rows: GuestRow[]): Household[] {
  const ordered = [...rows].sort((a, b) => a.index - b.index);
  const sets = new DisjointSets(ordered.length);

  for (const rule of MATCH_RULES) {
    const field = KEY_FOR_RULE[rule];
    const firstWithKey = new Map<string, number>();
    ordered.forEach((row, i) => {
      const key = row.keys[field];
      if (key === '') return; // blank keys never match
      const first = firstWithKey.get(key);
      if (first === undefined) firstWithKey.set(key, i);
      else sets.union(first, i, rule);
    });
  }

  // Map preserves insertion order, so groups come out in order of first appearance.
  const groups = new Map<number, number[]>();
  ordered.forEach((_, i) => {
    const root = sets.find(i);
    const members = groups.get(root);
    if (members) members.push(i);
    else groups.set(root, [i]);
  });

  return [...groups.values()].map((members, id) => {
    const groupRows = members
      .map((i) => ordered[i])
      .sort(
        (a, b) =>
          compareVisitDates(a.original['Visit Date'], b.original['Visit Date']) || a.index - b.index,
      );
    const ruleSet = sets.rulesOf(members[0]);
    const matchedBy = MATCH_RULES.filter((r) => ruleSet.has(r));
    return { id, rows: groupRows, primary: groupRows[0], matchedBy, flags: flagsFor(groupRows, matchedBy) };
  });
}

function flagsFor(rows: GuestRow[], matchedBy: MatchRule[]): string[] {
  const flags: string[] = [];
  if (rows.length > 1) flags.push(`Duplicate (${matchedBy.join(', ')})`);
  for (const row of rows) {
    if (!row.visitDateValid) {
      flags.push(`Invalid visit date (${row.original['Visit Date'].trim() || 'blank'})`);
    }
  }
  if (!rows.some((row) => row.hasContact)) flags.push(NO_CONTACT_FLAG);
  return flags;
}

/** Counts for the summary bar. */
export function summarize(rows: GuestRow[], households: Household[]): Summary {
  let duplicateGroups = 0;
  let duplicateRows = 0;
  let noContact = 0;
  let rowsWithIssues = 0;

  for (const household of households) {
    const isNoContact = household.flags.includes(NO_CONTACT_FLAG);
    if (household.rows.length > 1) {
      duplicateGroups++;
      duplicateRows += household.rows.length;
    }
    if (isNoContact) noContact++;
    rowsWithIssues += household.rows.filter((row) => isNoContact || !row.visitDateValid).length;
  }

  return {
    rowsLoaded: rows.length,
    households: households.length,
    duplicateGroups,
    duplicateRows,
    rowsWithIssues,
    invalidDates: rows.filter((row) => !row.visitDateValid).length,
    noContact,
  };
}
