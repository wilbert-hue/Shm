const fs = require('fs');
const path = require('path');

// Years: 2021-2033
const years = [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033];

// North America only
const regions = {
  'North America': ['U.S.', 'Canada'],
};

const regionBaseValues = {
  'North America': 295,
};

const countryShares = {
  'North America': { 'U.S.': 0.82, Canada: 0.18 },
};

const regionGrowthRates = {
  'North America': 0.118,
};

/**
 * Top-level segment types (replaces By Type / By Organ Type / Application / By End User).
 * Each type: leaf segment -> share of regional base (sums to 1 per type).
 */
const segmentTypesFlat = {
  'By Product Type': {
    'Ticket-inclusive Hospitality Packages': 1 / 3,
    'Ticket-inclusive Travel Packages': 1 / 3,
    'Hybrid Hospitality & Travel Packages': 1 / 3,
  },
  'By Customer Type': {
    Corporate: 0.25,
    Consumer: 0.25,
    'Group Travel': 0.25,
    'VIP / Luxury Buyers': 0.25,
  },
  'By Event Category': {
    'Single-event Packages': 1 / 6,
    'Multi-event Packages': 1 / 6,
    'Single-day Experiences': 1 / 6,
    'Multi-day / Itinerary-based Experiences': 1 / 6,
    'Hosted / Escorted Experiences': 1 / 6,
    'Self-guided Experiences': 1 / 6,
  },
  'By Vertical (Booking Channel)': {
    'Official Rights-holder Channels': 1 / 6,
    'Official Hospitality Partners': 1 / 6,
    'Official Travel Partners': 1 / 6,
    'Specialist Sports Tour Operators': 1 / 6,
    'Travel Agencies / Premium Agencies': 1 / 6,
    'Direct-to-Consumer Online Platforms': 1 / 6,
  },
  'By Sports Property / Event Type': {
    'Major League Sports': 1 / 6,
    'College Sports': 1 / 6,
    'Global Mega-events': 1 / 6,
    Motorsport: 1 / 6,
    'Golf / Tennis / Individual Sports': 1 / 6,
    'Combat Sports / Special Events': 1 / 6,
  },
};

const volumePerMillionUSD = 520;

let seed = 42;
function seededRandom() {
  seed = (seed * 16807 + 0) % 2147483647;
  return (seed - 1) / 2147483646;
}

function addNoise(value, noiseLevel = 0.03) {
  return value * (1 + (seededRandom() - 0.5) * 2 * noiseLevel);
}

function roundTo1(val) {
  return Math.round(val * 10) / 10;
}

function roundToInt(val) {
  return Math.round(val);
}

function leafGrowthMultiplier(label) {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h + label.charCodeAt(i) * (i + 1)) % 1000;
  return 0.92 + (h % 140) / 1000;
}

function generateTimeSeries(baseValue, growthRate, roundFn) {
  const series = {};
  for (let i = 0; i < years.length; i++) {
    const year = years[i];
    const rawValue = baseValue * Math.pow(1 + growthRate, i);
    series[year] = roundFn(addNoise(rawValue));
  }
  return series;
}

function buildFlatEmptyTree(shares) {
  const out = {};
  for (const leaf of Object.keys(shares)) {
    out[leaf] = {};
  }
  return out;
}

function writeFlatSegmentData(target, segType, shares, regionBase, regionGrowth, roundFn, multiplier) {
  if (!target[segType]) target[segType] = {};
  for (const [leaf, share] of Object.entries(shares)) {
    const segGrowth = regionGrowth * leafGrowthMultiplier(`${segType}|${leaf}`);
    const segBase = regionBase * share * multiplier;
    target[segType][leaf] = generateTimeSeries(segBase, segGrowth, roundFn);
  }
}

function generateGeoBundle(isVolume) {
  const data = {};
  const roundFn = isVolume ? roundToInt : roundTo1;
  const multiplier = isVolume ? volumePerMillionUSD : 1;

  for (const [regionName, countries] of Object.entries(regions)) {
    const regionBase = regionBaseValues[regionName] * multiplier;
    const regionGrowth = regionGrowthRates[regionName];

    data[regionName] = {};

    for (const [segType, shares] of Object.entries(segmentTypesFlat)) {
      writeFlatSegmentData(data[regionName], segType, shares, regionBase, regionGrowth, roundFn, multiplier);
    }

    data[regionName]['By Country'] = {};
    for (const country of countries) {
      const cShare = countryShares[regionName][country];
      const countryGrowthVariation = 1 + (seededRandom() - 0.5) * 0.06;
      const countryGrowth = regionGrowth * countryGrowthVariation;
      const countryBase = regionBase * cShare;

      data[country] = {};
      for (const [segType, shares] of Object.entries(segmentTypesFlat)) {
        writeFlatSegmentData(data[country], segType, shares, countryBase, countryGrowth, roundFn, multiplier);
      }

      const countryGrowth2 = regionGrowth * (1 + (seededRandom() - 0.5) * 0.04);
      data[regionName]['By Country'][country] = generateTimeSeries(
        regionBase * cShare,
        countryGrowth2,
        roundFn
      );
    }
  }

  return data;
}

function buildSegmentationAnalysis() {
  const analysis = {
    Global: {},
  };

  for (const [segType, shares] of Object.entries(segmentTypesFlat)) {
    analysis.Global[segType] = buildFlatEmptyTree(shares);
  }

  analysis.Global['By Region'] = {
    'North America': {
      'U.S.': {},
      Canada: {},
    },
  };

  return analysis;
}

seed = 42;
const valueData = generateGeoBundle(false);
seed = 7777;
const volumeData = generateGeoBundle(true);

const outDir = path.join(__dirname, 'public', 'data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'value.json'), JSON.stringify(valueData, null, 2));
fs.writeFileSync(path.join(outDir, 'volume.json'), JSON.stringify(volumeData, null, 2));
fs.writeFileSync(path.join(outDir, 'segmentation_analysis.json'), JSON.stringify(buildSegmentationAnalysis(), null, 2));

const firstType = Object.keys(segmentTypesFlat)[0];
console.log('Generated value.json, volume.json, segmentation_analysis.json');
console.log('Geographies:', Object.keys(valueData));
console.log('Segment types:', Object.keys(segmentTypesFlat));
console.log(`Sample North America "${firstType}":`, JSON.stringify(valueData['North America'][firstType], null, 2).slice(0, 600));
