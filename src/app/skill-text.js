// Every player-facing line about skills lives here: the tooltip flavour, what each tier means,
// and the unlock notices (which reuse the tier lines). No exact numbers on purpose.

export const TIERS = [
  { at: 0, name: "Untrained" },
  { at: 10, name: "Novice" },
  { at: 25, name: "Practiced" },
  { at: 50, name: "Skilled" },
  { at: 80, name: "Expert" },
];

export function tierOf(value) {
  let tier = 0;
  for (let i = 0; i < TIERS.length; i += 1) if ((value || 0) >= TIERS[i].at) tier = i;
  return tier;
}

// flavour: one line, no mechanics. tiers: plain words for what each tier lets you do (index = tier).
export const SKILL_TEXT = {
  appraisal: { label: "Appraisal", flavour: "A glance that weighs what a thing is worth.", tiers: [
    "Everything looks like rock.", "You can tell ore from stone.", "You read a vein's worth before digging.", "Rich seams stand out at a look.", "You price ground at a glance."] },
  jump: { label: "Jump", flavour: "Legs that remember being springs.", tiers: [
    "A hop, at best.", "You clear small steps.", "You clear a body's height of trouble.", "Gaps stop being obstacles.", "You take ledges others walk around."] },
  landing: { label: "Landing", flavour: "Knowing how to meet the ground.", tiers: [
    "Every drop jars you.", "You roll off short drops.", "Falls sting less.", "You walk away from long drops.", "The ground forgives you."] },
  run: { label: "Run", flavour: "The long stride of someone who goes places.", tiers: [
    "A jog that fades fast.", "A steady run.", "A quick, sure pace.", "Few can keep up.", "You cross the island at a sprint."] },
  wind: { label: "Wind", flavour: "Breath that lasts.", tiers: [
    "You tire quickly.", "You recover between sprints.", "Long runs stop winding you.", "Sprinting barely costs you.", "You never seem out of breath."] },
  mapping: { label: "Mapping", flavour: "A mind that keeps the shape of the land.", tiers: [
    "The chart is mostly blank.", "Nearby ground fills in.", "The chart holds what you've walked.", "You chart far beyond your feet.", "Your chart is the island."] },
  topography: { label: "Topography", flavour: "Reading rise and fall.", tiers: [
    "Hills are just hills.", "Slopes show on the chart.", "You read the lie of the land.", "Contours come easily.", "You see the island in relief."] },
  tracking: { label: "Tracking", flavour: "The ground keeps a diary; you can read it.", tiers: [
    "Footprints look like dirt.", "Your own trail stays with you.", "Fresh prints and dig marks catch your eye.", "Old trails and spoil heaps tell stories.", "Little crosses the ground unseen by you."] },
  trailing: { label: "Trailing", flavour: "Following someone without them knowing.", tiers: [
    "Others leave no trace for you.", "You can follow a fresh trail.", "Others' paths show on the chart.", "You keep a trail across rough ground.", "You can follow anyone, anywhere."] },
  marksmanship: { label: "Marksmanship", flavour: "A steady eye down a barrel.", tiers: [
    "Shots go roughly where you look.", "Near targets are easy.", "You hit what you aim at.", "Distance barely matters.", "You rarely miss."] },
  mining: { label: "Mining", flavour: "Knowing how stone wants to break.", tiers: [
    "Digging is slow work.", "The bit bites cleaner.", "You dig at a working pace.", "Stone gives way quickly.", "You move rock like soil."] },
  prospect: { label: "Prospect", flavour: "A nose for what lies below.", tiers: [
    "The ground keeps its secrets.", "You sense ore nearby.", "You find veins more often.", "You strike rich ground often.", "Ore seems to find you."] },
  building: { label: "Building", flavour: "Hands that turn timber into shelter.", tiers: [
    "Pieces rarely fit.", "Simple walls stand.", "Your builds are sound.", "You raise structures quickly.", "Your work outlasts weather."] },
  bracing: { label: "Bracing", flavour: "Making things hold.", tiers: [
    "Your builds wobble.", "Posts stay put.", "Walls take a knock.", "Your frames take heavy loads.", "What you brace stays braced."] },
  eyesight: { label: "Eyesight", flavour: "Eyes that bring the world into focus.", tiers: [
    "Only what you stare at is sharp.", "The sharp patch widens.", "Detail reaches further out.", "The edges of your view clear up.", "You see far and fine."] },
  focus: { label: "Focus", flavour: "Attention that narrows to a point.", tiers: [
    "Your gaze wanders.", "You hold a look a little longer.", "Zooming in stays steady.", "Distant detail resolves quickly.", "You lock on and see everything."] },
  dark: { label: "Dark adaptation", flavour: "Eyes that make peace with the night.", tiers: [
    "Night is a wall.", "Shapes emerge after dark.", "You get about by starlight.", "Night is only dim to you.", "The dark hides little from you."] },
  ranging: { label: "Ranging", flavour: "Knowing how far is far.", tiers: [
    "Distances are guesses.", "You judge near distances.", "Your guesses hold up.", "You read range at a glance.", "You know distance like a tape."] },
  measure: { label: "Measure", flavour: "The precise mind of a surveyor.", tiers: [
    "Rough estimates only.", "Close estimates.", "Readings you can trust.", "Survey-grade readings.", "Exact, every time."] },
  agility: { label: "Agility", flavour: "A body that goes where it's pointed.", tiers: [
    "Clumsy on rough ground.", "Surer footing.", "You move nimbly.", "You flow over terrain.", "Nothing trips you."] },
  hearing: { label: "Hearing", flavour: "Ears tuned to the island's voice.", tiers: [
    "Only loud, close sounds reach you.", "You hear a little further.", "Quiet sounds come through.", "You hear across a valley.", "Little escapes your ears."] },
  nature: { label: "Wildlife", flavour: "Birds, insects and grass have things to say.", tiers: [
    "Wildlife is background noise.", "Birdsong stands out.", "You pick out each creature.", "Wildlife sounds carry far for you.", "You hear the island breathe."] },
  footsteps: { label: "Footsteps", flavour: "The tread of others.", tiers: [
    "People surprise you.", "Close steps register.", "You hear people coming.", "You pick steps out of the wind.", "No one sneaks up on you."] },
  mechanics: { label: "Mechanics", flavour: "Shots, strikes and machinery.", tiers: [
    "Bangs are just bangs.", "You notice distant work.", "Shots and digging carry far.", "You read what's being done by ear.", "You hear work from across the island."] },
  weather: { label: "Weather", flavour: "Surf, wind and sky.", tiers: [
    "Weather is just noise.", "You hear gusts coming.", "Surf tells you where the shore is.", "You read the weather by ear.", "The wind talks to you."] },
  rare: { label: "Rare sounds", flavour: "The things most people never hear.", tiers: [
    "Strange sounds pass you by.", "Now and then, something odd.", "You catch what others miss.", "Hidden things call to you.", "The island's secrets are audible."] },
  localization: { label: "Localization", flavour: "Knowing where a sound came from.", tiers: [
    "Sounds come from everywhere.", "You can tell left from right.", "You turn roughly toward a sound.", "You place sounds closely.", "You point straight at any sound."] },
  awareness: { label: "Awareness", flavour: "The feeling of being watched.", tiers: [
    "You never feel eyes on you.", "A prickle when someone's very close.", "You sense movement at your back.", "You feel approaches from afar.", "Nothing comes at you unannounced."] },
};

export function skillLabel(name) {
  return SKILL_TEXT[name]?.label || name;
}

// Two lines for a tooltip: flavour, then what the current tier means.
export function tooltipFor(name, value) {
  const text = SKILL_TEXT[name];
  if (!text) return null;
  const tier = tierOf(value);
  return { flavour: text.flavour, tier: `${TIERS[tier].name}: ${text.tiers[tier]}`, tierIndex: tier };
}

// Notice text when `name` reaches `tier`.
export function unlockText(name, tier) {
  const text = SKILL_TEXT[name];
  if (!text || !tier) return null;
  return `${text.label} — ${TIERS[tier].name}: ${text.tiers[tier]}`;
}
