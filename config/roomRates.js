// Room-rate matrix definition shared by the startup migration, the model and the
// controller. Each category is priced by day range (weekday / weekend), bed type
// (king / queen) and breakfast option (no / one / two) -> 12 amounts per category.

// Lean/Peak season - which one applies to a booking is resolved automatically
// from the check-in date's calendar month (see room_rate_season_months / the
// month->season assignment on the Room Rates admin page), not picked manually
// per booking.
const SEASONS = [
  { key: 'lean', label: 'Lean Season' },
  { key: 'peak', label: 'Peak Season' }
];
const DEFAULT_SEASON = 'lean';

const MONTHS = [
  { num: 1, label: 'January' },
  { num: 2, label: 'February' },
  { num: 3, label: 'March' },
  { num: 4, label: 'April' },
  { num: 5, label: 'May' },
  { num: 6, label: 'June' },
  { num: 7, label: 'July' },
  { num: 8, label: 'August' },
  { num: 9, label: 'September' },
  { num: 10, label: 'October' },
  { num: 11, label: 'November' },
  { num: 12, label: 'December' }
];

const DAY_RANGES = [
  { key: 'weekday', label: 'Monday - Thursday' },
  { key: 'weekend', label: 'Friday - Sunday' }
];

// room_rates is now keyed by ROOM_TYPE_ID (FK -> room_type.IDNo). These slugs
// only describe the printed rate sheet's two columns; the startup migration maps
// each slug to the matching room_type row (by name) when seeding.
const BED_SLUGS = ['king', 'queen'];

// Kept for backward compatibility with older callers.
const BED_TYPES = [
  { key: 'king', label: 'King' },
  { key: 'queen', label: 'Queen' }
];

const BREAKFAST_OPTIONS = [
  { key: 'no', label: 'No BF' },
  { key: 'one', label: 'One BF' },
  { key: 'two', label: 'Two BF' }
];

// Order here is the display order on the page.
const CATEGORIES = [
  { key: 'walk_in', label: 'Walk-in Rate' },
  { key: 'agency', label: 'Agency Rate' },
  { key: 'tenant', label: '세입자 (15%) — Tenant' },
  { key: 'vip', label: 'VIP (20%)' },
  { key: 'employee', label: '임직원 (30%) — Employee' },
  { key: 'senior_special', label: 'Senior (노인) / Special (장애) 20%' },
  // Long Term Stay promo - progressively cheaper the longer the stay, per the
  // hotel's printed "LONG STAY PROMO" rate card. Each band is its own
  // category (flat per-night rate within the band, same as every other
  // category here) rather than a computed discount, since the card's numbers
  // don't reduce to one clean formula across bands - see LONG_TERM_BANDS in
  // the booking JS (add_booking.js / add_group_booking.ejs /
  // edit_group_booking.ejs) for which band a given night count resolves to.
  { key: 'long_term', label: 'Long Term Stay (10-14 nights)' },
  { key: 'long_term_15', label: 'Long Term Stay (15-19 nights)' },
  { key: 'long_term_20', label: 'Long Term Stay (20-24 nights)' },
  { key: 'long_term_25', label: 'Long Term Stay (25-29 nights)' },
  { key: 'long_term_30', label: 'Long Term Stay (30-31 nights)' },
  { key: 'long_term_over30', label: 'Long Term Stay (32+ nights)' }
];

// Seed values taken from the printed rate sheet. Structure:
// SEED[category][dayRange][bedType][breakfast] = amount
const SEED = {
  walk_in: {
    weekday: { king: { no: 3300, one: 3500, two: 3800 }, queen: { no: 3700, one: 3900, two: 4200 } },
    weekend: { king: { no: 3800, one: 4000, two: 4300 }, queen: { no: 4200, one: 4400, two: 4700 } }
  },
  agency: {
    weekday: { king: { no: 2700, one: 2900, two: 3200 }, queen: { no: 3100, one: 3300, two: 3600 } },
    weekend: { king: { no: 3200, one: 3400, two: 3700 }, queen: { no: 3600, one: 3800, two: 4100 } }
  },
  tenant: {
    weekday: { king: { no: 2805, one: 2975, two: 3230 }, queen: { no: 3145, one: 3315, two: 3570 } },
    weekend: { king: { no: 3230, one: 3400, two: 3655 }, queen: { no: 3570, one: 3740, two: 3995 } }
  },
  vip: {
    weekday: { king: { no: 2640, one: 2800, two: 3040 }, queen: { no: 2960, one: 3120, two: 3360 } },
    weekend: { king: { no: 3040, one: 3200, two: 3440 }, queen: { no: 3360, one: 3520, two: 3760 } }
  },
  employee: {
    weekday: { king: { no: 2310, one: 2450, two: 2660 }, queen: { no: 2590, one: 2730, two: 2940 } },
    weekend: { king: { no: 2660, one: 2800, two: 3010 }, queen: { no: 2940, one: 3080, two: 3290 } }
  },
  senior_special: {
    weekday: { king: { no: 2640, one: 2800, two: 3040 }, queen: { no: 2960, one: 3120, two: 3360 } },
    weekend: { king: { no: 3040, one: 3200, two: 3440 }, queen: { no: 3360, one: 3520, two: 3760 } }
  },
  // No weekday/weekend split for any Long Term band - a long-term guest pays
  // the same rate every night of the stay, so weekday and weekend are seeded
  // identically. Per-night rates verified against the printed promo card by
  // dividing every row's total by its night count (constant within each band).
  long_term: {
    weekday: { king: { no: 3201, one: 3395, two: 3686 }, queen: { no: 3589, one: 3783, two: 4074 } },
    weekend: { king: { no: 3201, one: 3395, two: 3686 }, queen: { no: 3589, one: 3783, two: 4074 } }
  },
  long_term_15: {
    weekday: { king: { no: 3135, one: 3325, two: 3610 }, queen: { no: 3515, one: 3705, two: 3990 } },
    weekend: { king: { no: 3135, one: 3325, two: 3610 }, queen: { no: 3515, one: 3705, two: 3990 } }
  },
  long_term_20: {
    weekday: { king: { no: 3069, one: 3255, two: 3534 }, queen: { no: 3441, one: 3627, two: 3906 } },
    weekend: { king: { no: 3069, one: 3255, two: 3534 }, queen: { no: 3441, one: 3627, two: 3906 } }
  },
  long_term_25: {
    weekday: { king: { no: 3003, one: 3185, two: 3458 }, queen: { no: 3367, one: 3549, two: 3822 } },
    weekend: { king: { no: 3003, one: 3185, two: 3458 }, queen: { no: 3367, one: 3549, two: 3822 } }
  },
  long_term_30: {
    weekday: { king: { no: 2970, one: 3150, two: 3420 }, queen: { no: 3330, one: 3510, two: 3780 } },
    weekend: { king: { no: 2970, one: 3150, two: 3420 }, queen: { no: 3330, one: 3510, two: 3780 } }
  },
  long_term_over30: {
    weekday: { king: { no: 2874, one: 3048, two: 3310 }, queen: { no: 3223, one: 3397, two: 3658 } },
    weekend: { king: { no: 2874, one: 3048, two: 3310 }, queen: { no: 3223, one: 3397, two: 3658 } }
  }
};

// Which category a given night count resolves to, and the display range each
// covers - single source of truth for the booking JS's identical band lookup
// (add_booking.js / add_group_booking.ejs / edit_group_booking.ejs each
// duplicate this as a plain array since they can't require() this Node
// module directly, matching how CATEGORIES' labels above were derived from
// this same promo card).
const LONG_TERM_BANDS = [
  { min: 10, max: 14, category: 'long_term' },
  { min: 15, max: 19, category: 'long_term_15' },
  { min: 20, max: 24, category: 'long_term_20' },
  { min: 25, max: 29, category: 'long_term_25' },
  { min: 30, max: 31, category: 'long_term_30' },
  { min: 32, max: null, category: 'long_term_over30' }
];

function longTermCategoryForNights(nights) {
  const n = parseInt(nights, 10) || 0;
  for (const band of LONG_TERM_BANDS) {
    if (n >= band.min && (band.max === null || n <= band.max)) return band.category;
  }
  return null;
}

const SEASON_KEYS = new Set(SEASONS.map((s) => s.key));
const CATEGORY_KEYS = new Set(CATEGORIES.map((c) => c.key));
const DAY_RANGE_KEYS = new Set(DAY_RANGES.map((d) => d.key));
const BED_TYPE_KEYS = new Set(BED_TYPES.map((b) => b.key));
const BREAKFAST_KEYS = new Set(BREAKFAST_OPTIONS.map((b) => b.key));

// Validate the four fixed axes. Room type is validated against the DB, not here.
function isValidAxes(season, category, dayRange, breakfast) {
  return SEASON_KEYS.has(season)
    && CATEGORY_KEYS.has(category)
    && DAY_RANGE_KEYS.has(dayRange)
    && BREAKFAST_KEYS.has(breakfast);
}

// Backward-compatible: old signature (category, dayRange, bedType, breakfast) -
// no season, defaults to 'lean'.
function isValidCell(category, dayRange, bedTypeOrBreakfast, breakfast) {
  if (arguments.length >= 4) {
    return isValidAxes(DEFAULT_SEASON, category, dayRange, breakfast) && BED_TYPE_KEYS.has(bedTypeOrBreakfast);
  }
  return isValidAxes(DEFAULT_SEASON, category, dayRange, bedTypeOrBreakfast);
}

// Flatten SEED into [{category, dayRange, bedSlug, breakfast, amount}]. The
// migration maps bedSlug -> ROOM_TYPE_ID when it seeds room_rates.
function seedRows() {
  const rows = [];
  for (const { key: category } of CATEGORIES) {
    for (const { key: dayRange } of DAY_RANGES) {
      for (const bedSlug of BED_SLUGS) {
        for (const { key: breakfast } of BREAKFAST_OPTIONS) {
          rows.push({
            season: DEFAULT_SEASON,
            category,
            dayRange,
            bedSlug,
            breakfast,
            amount: SEED[category][dayRange][bedSlug][breakfast]
          });
        }
      }
    }
  }
  return rows;
}

module.exports = {
  SEASONS,
  SEASON_KEYS,
  DEFAULT_SEASON,
  MONTHS,
  DAY_RANGES,
  BED_TYPES,
  BED_SLUGS,
  BREAKFAST_OPTIONS,
  CATEGORIES,
  SEED,
  LONG_TERM_BANDS,
  longTermCategoryForNights,
  isValidAxes,
  isValidCell,
  seedRows
};
