// Room-rate matrix definition shared by the startup migration, the model and the
// controller. Each category is priced by day range (weekday / weekend), bed type
// (king / queen) and breakfast option (no / one / two) -> 12 amounts per category.

const DAY_RANGES = [
  { key: 'weekday', label: 'Monday - Thursday' },
  { key: 'weekend', label: 'Friday - Sunday' }
];

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
  { key: 'senior_special', label: 'Senior (노인) / Special (장애) 20%' }
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
  }
};

const CATEGORY_KEYS = new Set(CATEGORIES.map((c) => c.key));
const DAY_RANGE_KEYS = new Set(DAY_RANGES.map((d) => d.key));
const BED_TYPE_KEYS = new Set(BED_TYPES.map((b) => b.key));
const BREAKFAST_KEYS = new Set(BREAKFAST_OPTIONS.map((b) => b.key));

function isValidCell(category, dayRange, bedType, breakfast) {
  return CATEGORY_KEYS.has(category)
    && DAY_RANGE_KEYS.has(dayRange)
    && BED_TYPE_KEYS.has(bedType)
    && BREAKFAST_KEYS.has(breakfast);
}

// Flatten SEED into [{category, dayRange, bedType, breakfast, amount}]
function seedRows() {
  const rows = [];
  for (const { key: category } of CATEGORIES) {
    for (const { key: dayRange } of DAY_RANGES) {
      for (const { key: bedType } of BED_TYPES) {
        for (const { key: breakfast } of BREAKFAST_OPTIONS) {
          rows.push({
            category,
            dayRange,
            bedType,
            breakfast,
            amount: SEED[category][dayRange][bedType][breakfast]
          });
        }
      }
    }
  }
  return rows;
}

module.exports = {
  DAY_RANGES,
  BED_TYPES,
  BREAKFAST_OPTIONS,
  CATEGORIES,
  SEED,
  isValidCell,
  seedRows
};
