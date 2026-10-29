function skillValue(skills, name) {
  const value = skills?.[name];
  return typeof value === "number" ? value : value?.value || 0;
}

const WRITERS = {
  dig: { skill: "mining", need: 4, line: "The sand took a hole." },
  fill: { skill: "mining", need: 8, line: "I put the sand back." },
  wall: { skill: "building", need: 1, line: "I raised a wall on the footing." },
  hearth: { skill: "building", need: 4, line: "A hearth stands on the old stone." },
  fin: { skill: "building", need: 8, line: "The fin is set where the sun can find it." },
  bind: { skill: "building", need: 4, line: "I bound myself to the hearth." },
  strike: { skill: "appraisal", need: 20, line: "The compound runs a strike. The beach does not." },
  paper: { skill: "appraisal", need: 8, line: "A paper in the crate: the compound is north, the bit digs, a hearth binds, the fin drinks the sun." },
};

export function createNotes() {
  return [];
}

export function writeNote(notes, skills, kind, fact = {}) {
  const writer = WRITERS[kind];
  const line = writer
    ? (skillValue(skills, writer.skill) >= writer.need ? writer.line : "")
    : kind === "seen"
      ? (skillValue(skills, "appraisal") >= 8 ? String(fact.line || "") : "")
      : "";
  if (!line) return null;
  if (notes.some((note) => note.line === line)) return null;
  const note = { kind, skill: writer?.skill || "appraisal", line };
  notes.push(note);
  if (notes.length > 12) notes.shift();
  return note;
}

export function offerNotes(notes, skills, tier) {
  if (!notes.length || tier === "stranger" || tier === "hostile") return [];
  const appraisal = skillValue(skills, "appraisal");
  const mapping = skillValue(skills, "mapping");
  if (appraisal < 8 && mapping < 8) return [];
  const cap = tier === "friend" && (appraisal >= 20 || mapping >= 16) ? 3 : 1;
  return notes.slice(-cap).map((note) => note.line);
}

export function takeTold(notes, skills, line, by = "") {
  if (!line || notes.some((note) => note.line === line)) return null;
  if (skillValue(skills, "appraisal") < 8 && skillValue(skills, "mapping") < 8) return null;
  const note = { kind: "told", skill: "appraisal", line };
  if (by) note.by = by;
  notes.push(note);
  if (notes.length > 12) notes.shift();
  return note;
}
