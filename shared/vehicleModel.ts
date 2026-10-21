// A model name that looks like a registration. "C200", "NX350h", "SR5", "RAV4"
// and "X5" are letters and digits run together, exactly the shape of a plate,
// so typing one inside a vehicle description used to be bracketed as a
// registration — "A blue Mercedes Benz C200 (Vehicle C200), sedan, bearing WA
// registration 1FAB007 (Vehicle 1FAB007)" — and then showed up as a second
// vehicle. The test here is the one thing that tells them apart without
// guessing at models: a model comes straight after a make, in the same
// description ("Mercedes Benz C200", "Toyota Hilux SR5"), while a plate is
// introduced by "registration" / "rego" or stands on its own. Deterministic,
// no list of models to keep up to date.

/** Vehicle makes, as written in an observation. Used to read a bracket that
 * holds a make instead of a plate, and to tell a model from a plate. */
export const VEHICLE_MAKES_PATTERN =
  /\b(toyota|ford|holden|honda|mazda|nissan|mitsubishi|subaru|hyundai|kia|volkswagen|vw|bmw|mercedes|audi|lexus|volvo|jeep|dodge|chevrolet|chevy|ram|gmc|chrysler|fiat|alfa|peugeot|renault|citroen|skoda|seat|suzuki|isuzu|daihatsu|ssangyong|great wall|gwm|haval|mg|byd|tesla|rivian|land rover|range rover|defender|discovery|jaguar|porsche|ferrari|lamborghini|maserati|bentley|rolls royce|aston martin|mclaren|lotus|mini|smart|dacia|lancia|opel|vauxhall|saab|pontiac|buick|cadillac|lincoln|infiniti|acura|genesis|lucid|polestar|scout|rivian)\b/i;

const MAKE_NAMES = VEHICLE_MAKES_PATTERN.source;

// A make, then at most two more plain words (a model and a trim), then the
// word being typed. A comma, a bracket or the word "registration" / "rego" /
// "plate" / a state code in between means the description has ended, so what
// follows is a plate.
const MODEL_AFTER_MAKE = new RegExp(
  `(?:${MAKE_NAMES})(?:\\s+(?!(?:regist[a-z]*|rego|reg|plates?|number|no|wa|nsw|vic|qld|sa|tas|nt|act|bearing|and|with|in|on|at|to)\\b)[A-Za-z][A-Za-z-]*){0,2}\\s+$`,
  "i"
);

/**
 * True when the word that comes next, after `textBefore`, is a model or trim
 * of a make written just before it, not a registration.
 */
export function followsVehicleMake(textBefore: string): boolean {
  return MODEL_AFTER_MAKE.test(textBefore.slice(-60));
}
