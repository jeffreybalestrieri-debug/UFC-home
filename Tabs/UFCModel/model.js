// ═══════════════════════════════════════════
// UFC MODEL — Core Calculation Engine
// Port of R/calc.R
// ═══════════════════════════════════════════

const SHEET_BASE =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRdhtwhPgnZMmrAt9OjYBEwKm4It04s3ZqyDC2aPcpIROuuqHytm9_6qlzR1a8YHEg5lQwvsh6NXlzj/pub?output=csv&gid=';

const MODEL_GIDS = {
  matchups: '1693975543',
  fighter_stats: '1141620905',
  betting: '1676778832',
  sig_strikes: '327707567',
};

const FINISH_BASELINES = [
  { wc: 'Lightweight', finish: 0.55, ko: 0.3675, sub: 0.1766, avg_str_min: 7.835 },
  { wc: 'Bantamweight', finish: 0.42, ko: 0.2492, sub: 0.1456, avg_str_min: 6.839 },
  { wc: 'Heavyweight', finish: 0.58, ko: 0.4348, sub: 0.1196, avg_str_min: 6.596 },
  { wc: "Women's Flyweight", finish: 0.34, ko: 0.1707, sub: 0.1707, avg_str_min: 7.087 },
  { wc: 'Featherweight', finish: 0.49, ko: 0.3246, sub: 0.1574, avg_str_min: 7.257 },
  { wc: 'Middleweight', finish: 0.59, ko: 0.3891, sub: 0.1793, avg_str_min: 6.441 },
  { wc: 'Light Heavyweight', finish: 0.62, ko: 0.4541, sub: 0.1514, avg_str_min: 6.95 },
  { wc: 'Flyweight', finish: 0.5, ko: 0.2553, sub: 0.234, avg_str_min: 5.696 },
  { wc: 'Welterweight', finish: 0.54, ko: 0.3482, sub: 0.1789, avg_str_min: 6.974 },
  { wc: "Women's Strawweight", finish: 0.37, ko: 0.1802, sub: 0.1744, avg_str_min: 7.164 },
  { wc: 'Catch Weight', finish: 0.5, ko: 0.2619, sub: 0.2381, avg_str_min: 6.21 },
  { wc: "Women's Bantamweight", finish: 0.38, ko: 0.1563, sub: 0.2083, avg_str_min: 5.947 },
  { wc: "Women's Featherweight", finish: 0.27, ko: 0.0667, sub: 0.2, avg_str_min: 7.297 },
];

const ROUND_BASELINES = [
  { wc: 'Lightweight', r1: 0.4742, r2: 0.3608, r3: 0.1649 },
  { wc: 'Bantamweight', r1: 0.4419, r2: 0.3333, r3: 0.2248 },
  { wc: 'Heavyweight', r1: 0.5943, r2: 0.3113, r3: 0.0943 },
  { wc: "Women's Flyweight", r1: 0.375, r2: 0.3929, r3: 0.2321 },
  { wc: 'Featherweight', r1: 0.5, r2: 0.3176, r3: 0.1824 },
  { wc: 'Middleweight', r1: 0.4718, r2: 0.3436, r3: 0.1846 },
  { wc: 'Light Heavyweight', r1: 0.5877, r2: 0.2544, r3: 0.1579 },
  { wc: 'Flyweight', r1: 0.4574, r2: 0.3511, r3: 0.1915 },
  { wc: 'Welterweight', r1: 0.5238, r2: 0.2857, r3: 0.1905 },
  { wc: "Women's Strawweight", r1: 0.3333, r2: 0.4921, r3: 0.1746 },
  { wc: 'Catch Weight', r1: 0.4762, r2: 0.381, r3: 0.1429 },
  { wc: "Women's Bantamweight", r1: 0.3611, r2: 0.3889, r3: 0.25 },
  { wc: "Women's Featherweight", r1: 0.25, r2: 0.5, r3: 0.25 },
];

const WEIGHT_CLASSES = FINISH_BASELINES.map(function (b) {
  return b.wc;
});

function getFinishBaseline(wc) {
  return (
    FINISH_BASELINES.find(function (b) {
      return b.wc === wc;
    }) || FINISH_BASELINES[0]
  );
}

function getRoundBaseline(wc) {
  return (
    ROUND_BASELINES.find(function (b) {
      return b.wc === wc;
    }) || ROUND_BASELINES[0]
  );
}

function oddsToImplied(odds) {
  var n = parseFloat(odds);
  if (isNaN(n) || n === 0) return NaN;
  return n < 0 ? -n / (-n + 100) : 100 / (n + 100);
}

function probToAmerican(p) {
  var n = parseFloat(p);
  if (isNaN(n) || n <= 0 || n >= 1) return NaN;
  return n >= 0.5 ? -(n / (1 - n)) * 100 : ((1 - n) / n) * 100;
}

function fmtAmerican(p) {
  var n = probToAmerican(p);
  if (isNaN(n)) return '—';
  return n >= 0 ? '+' + Math.round(n) : String(Math.round(n));
}

function fmtRawOdds(n) {
  n = parseFloat(n);
  if (isNaN(n)) return '—';
  return n >= 0 ? '+' + Math.round(n) : String(Math.round(n));
}

function fmtPct(p) {
  p = parseFloat(p);
  if (isNaN(p)) return '—';
  return (p * 100).toFixed(1) + '%';
}

function getStat(row, col, defaultVal) {
  if (defaultVal === undefined) defaultVal = 0;
  if (!row || !(col in row)) return defaultVal;
  var v = parseFloat(row[col]);
  return isNaN(v) ? defaultVal : v;
}

function randNorm() {
  var u;
  do {
    u = Math.random();
  } while (u === 0);
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * Math.random());
}

function simSigStrikes(
  muA,
  muB,
  lineA,
  lineB,
  tdMinA,
  tdMinB,
  phi,
  sigmaFloor,
  rho,
  kGrapOwn,
  kGrapOpp,
  nSims,
) {
  if (tdMinA === undefined) tdMinA = 0;
  if (tdMinB === undefined) tdMinB = 0;
  if (phi === undefined) phi = 1.8;
  if (sigmaFloor === undefined) sigmaFloor = 10;
  if (rho === undefined) rho = -0.35;
  if (kGrapOwn === undefined) kGrapOwn = 0.2;
  if (kGrapOpp === undefined) kGrapOpp = 0.5;
  if (nSims === undefined) nSims = 10000;

  muA = parseFloat(muA);
  muB = parseFloat(muB);
  lineA = parseFloat(lineA);
  lineB = parseFloat(lineB);
  if (
    [muA, muB, lineA, lineB].some(function (v) {
      return isNaN(v);
    })
  )
    return null;
  if (muA < 0 || muB < 0) return null;

  var suppA = Math.max(0.55, 1 - kGrapOpp * tdMinB - kGrapOwn * tdMinA);
  var suppB = Math.max(0.55, 1 - kGrapOpp * tdMinA - kGrapOwn * tdMinB);
  var suppSym = Math.max(0.55, 1 - 0.4 * (tdMinA + tdMinB));

  var corrA = suppSym > 0 ? suppA / suppSym : 1;
  var corrB = suppSym > 0 ? suppB / suppSym : 1;

  var adjMuA = Math.max(0, muA * corrA);
  var adjMuB = Math.max(0, muB * corrB);

  var sigmaA = Math.max(sigmaFloor, Math.sqrt(Math.max(0, adjMuA * phi)));
  var sigmaB = Math.max(sigmaFloor, Math.sqrt(Math.max(0, adjMuB * phi)));

  var sqrt1r2 = Math.sqrt(1 - rho * rho);
  var overA = 0,
    overB = 0;

  for (var i = 0; i < nSims; i++) {
    var z1 = randNorm();
    var z2 = randNorm();
    var xA = Math.max(0, Math.round(adjMuA + sigmaA * z1));
    var xB = Math.max(0, Math.round(adjMuB + sigmaB * (rho * z1 + sqrt1r2 * z2)));
    if (xA > lineA) overA++;
    if (xB > lineB) overB++;
  }

  return {
    overA: overA / nSims,
    underA: 1 - overA / nSims,
    overB: overB / nSims,
    underB: 1 - overB / nSims,
    adjMuA: adjMuA,
    adjMuB: adjMuB,
  };
}

function estimateExpMins(sim, nRounds) {
  if (nRounds === undefined) nRounds = 3;
  var maxMins = nRounds * 5;
  var rMids = nRounds === 5 ? [2.5, 7.5, 12.5, 17.5, 22.5] : [2.5, 7.5, 12.5];
  return parseFloat(
    (
      sim.p_r1 * rMids[0] +
      sim.p_r2 * rMids[1] +
      sim.p_r3 * rMids[Math.min(2, nRounds - 1)] +
      sim.p_decision * maxMins
    ).toFixed(1),
  );
}

function runMatchupSim(
  fighterA,
  fighterB,
  weightClass,
  winProbA,
  fighterStats,
  roundTotal,
  overOdds,
  underOdds,
) {
  if (roundTotal === undefined) roundTotal = null;
  if (overOdds === undefined) overOdds = null;
  if (underOdds === undefined) underOdds = null;

  var winA = parseFloat(winProbA);
  var winB = 1 - winA;

  var base = getFinishBaseline(weightClass);
  var rb = getRoundBaseline(weightClass);

  var nameKey = Object.keys((fighterStats && fighterStats[0]) || {})[0] || 'Fighter';
  var sA =
    fighterStats.find(function (r) {
      return r[nameKey] === fighterA;
    }) || {};
  var sB =
    fighterStats.find(function (r) {
      return r[nameKey] === fighterB;
    }) || {};

  var strMinA = getStat(sA, 'Str/Min', base.avg_str_min);
  var strMinB = getStat(sB, 'Str/Min', base.avg_str_min);
  var tdMinA = getStat(sA, 'TD/Min');
  var tdMinB = getStat(sB, 'TD/Min');
  var subMinA = getStat(sA, 'Sub/Min');
  var subMinB = getStat(sB, 'Sub/Min');
  var finishBiasA = getStat(sA, 'Finish_For_Bias', 1.0);
  var finishBiasB = getStat(sB, 'Finish_For_Bias', 1.0);
  var compAdjA = getStat(sA, 'Composite_Adjustment', 0.49);
  var compAdjB = getStat(sB, 'Composite_Adjustment', 0.49);
  var effectiveKO_A = getStat(sA, 'Effective_KO_Rate');
  var effectiveSub_A = getStat(sA, 'Effective_Sub_Rate');
  var effectiveKO_B = getStat(sB, 'Effective_KO_Rate');
  var effectiveSub_B = getStat(sB, 'Effective_Sub_Rate');
  var blendedR1_A = getStat(sA, 'Blended_R1_Rate');
  var blendedR2_A = getStat(sA, 'Blended_R2_Rate');
  var blendedR3_A = getStat(sA, 'Blended_R3_Rate');
  var blendedR1_B = getStat(sB, 'Blended_R1_Rate');
  var blendedR2_B = getStat(sB, 'Blended_R2_Rate');
  var blendedR3_B = getStat(sB, 'Blended_R3_Rate');
  var subDefA = getStat(sA, 'Sub_Defense_Rating', 1.0);
  var subDefB = getStat(sB, 'Sub_Defense_Rating', 1.0);

  var interactionTerm = Math.min(1.5, 1 + 0.3 * (finishBiasA - 1) * (finishBiasB - 1));
  var avgStrMin = base.avg_str_min > 0 ? base.avg_str_min : 1;
  var paceFactor = Math.min(1.2, Math.max(0.8, (strMinA + strMinB) / (2 * avgStrMin)));

  var r1A = blendedR1_A > 0 ? blendedR1_A : rb.r1;
  var r2A = blendedR2_A > 0 ? blendedR2_A : rb.r2;
  var r3A = blendedR3_A > 0 ? blendedR3_A : rb.r3;
  var r1B = blendedR1_B > 0 ? blendedR1_B : rb.r1;
  var r2B = blendedR2_B > 0 ? blendedR2_B : rb.r2;
  var r3B = blendedR3_B > 0 ? blendedR3_B : rb.r3;

  var r1C = winA * r1A + winB * r1B;
  var r2C = winA * r2A + winB * r2B;
  var r3C = winA * r3A + winB * r3B;
  var rT = r1C + r2C + r3C;
  if (rT > 0) {
    r1C /= rT;
    r2C /= rT;
    r3C /= rT;
  } else {
    r1C = rb.r1;
    r2C = rb.r2;
    r3C = rb.r3;
  }

  var implO = oddsToImplied(overOdds);
  var implU = oddsToImplied(underOdds);
  var rt = parseFloat(roundTotal);
  var hasMarket = roundTotal !== null && !isNaN(rt) && rt > 0 && !isNaN(implO) && !isNaN(implU);

  var pTotalFinish;
  if (hasMarket) {
    var fairU = implU / (implU + implO);
    var covered =
      rt <= 1.5 ? r1C + r2C * 0.5 : rt <= 2.5 ? r1C + r2C + r3C * 0.5 : r1C + r2C + r3C * 0.75;
    covered = Math.max(covered, 0.1);
    pTotalFinish = Math.min(0.95, fairU / covered);
  } else {
    pTotalFinish = Math.min(0.85, base.finish * interactionTerm * paceFactor);
  }

  var pR1 = pTotalFinish * r1C;
  var pR2 = pTotalFinish * r2C;
  var pR3 = pTotalFinish * r3C;
  var pDec = 1 - pTotalFinish;

  var finA = pTotalFinish * winA;
  var finB = pTotalFinish * winB;

  var finRate = base.finish > 0 ? base.finish : 1;
  var bKO = base.ko / finRate;
  var bSub = base.sub / finRate;

  var koA = bKO,
    subA = bSub;
  if (effectiveKO_A + effectiveSub_A > 0) {
    var sTotal = effectiveKO_A + effectiveSub_A;
    koA = effectiveKO_A / sTotal;
    subA = effectiveSub_A / sTotal;
  }
  var koB = bKO,
    subB = bSub;
  if (effectiveKO_B + effectiveSub_B > 0) {
    var sTotalB = effectiveKO_B + effectiveSub_B;
    koB = effectiveKO_B / sTotalB;
    subB = effectiveSub_B / sTotalB;
  }

  var grapMulA = Math.min(2.0, 1 + 0.8 * tdMinA + 2.0 * subMinA);
  var grapMulB = Math.min(2.0, 1 + 0.8 * tdMinB + 2.0 * subMinB);
  var adjSubA = Math.min(0.85, subA * grapMulA),
    adjKOA = 1 - adjSubA;
  var adjSubB = Math.min(0.85, subB * grapMulB),
    adjKOB = 1 - adjSubB;

  var durA = Math.max(0.5, Math.min(1.5, 1.0 + (0.49 - compAdjB) * 0.6));
  var durB = Math.max(0.5, Math.min(1.5, 1.0 + (0.49 - compAdjA) * 0.6));

  var dKOA = adjKOA * durA,
    tA = dKOA + adjSubA;
  dKOA /= tA;
  var dSubA = adjSubA / tA;
  var dKOB = adjKOB * durB,
    tB = dKOB + adjSubB;
  dKOB /= tB;
  var dSubB = adjSubB / tB;

  var sdMulA = Math.max(0.3, Math.min(1.7, 2 - subDefB));
  var sdMulB = Math.max(0.3, Math.min(1.7, 2 - subDefA));

  var fSubA = Math.max(0.02, Math.min(0.9, dSubA * sdMulA)),
    fKOA = 1 - fSubA;
  var fSubB = Math.max(0.02, Math.min(0.9, dSubB * sdMulB)),
    fKOB = 1 - fSubB;

  return {
    win_a: winA,
    win_b: winB,
    finish_a: finA,
    finish_b: finB,
    ko_a: finA * fKOA,
    sub_a: finA * fSubA,
    dec_a: pDec * winA,
    ko_b: finB * fKOB,
    sub_b: finB * fSubB,
    dec_b: pDec * winB,
    p_finish: pTotalFinish,
    p_decision: pDec,
    p_r1: pR1,
    p_r2: pR2,
    p_r3: pR3,
    win_a_r1: pR1 * winA,
    win_a_r2: pR2 * winA,
    win_a_r3: pR3 * winA,
    win_b_r1: pR1 * winB,
    win_b_r2: pR2 * winB,
    win_b_r3: pR3 * winB,
    ko_a_r1: pR1 * winA * fKOA,
    ko_a_r2: pR2 * winA * fKOA,
    ko_a_r3: pR3 * winA * fKOA,
    sub_a_r1: pR1 * winA * fSubA,
    sub_a_r2: pR2 * winA * fSubA,
    sub_a_r3: pR3 * winA * fSubA,
    ko_b_r1: pR1 * winB * fKOB,
    ko_b_r2: pR2 * winB * fKOB,
    ko_b_r3: pR3 * winB * fKOB,
    sub_b_r1: pR1 * winB * fSubB,
    sub_b_r2: pR2 * winB * fSubB,
    sub_b_r3: pR3 * winB * fSubB,
    under25: pTotalFinish * (r1C + r2C),
    over25: 1 - pTotalFinish * (r1C + r2C),
    strMinA: strMinA,
    strMinB: strMinB,
    tdMinA: tdMinA,
    tdMinB: tdMinB,
  };
}

function parseCSVtoObjects(text) {
  var rows = parseCSV(text);
  if (rows.length < 2) return [];
  var headers = rows[0];
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (
      !r.some(function (c) {
        return c.trim() !== '';
      })
    )
      continue;
    var obj = {};
    headers.forEach(function (h, j) {
      obj[h] = r[j] !== undefined ? r[j] : '';
    });
    out.push(obj);
  }
  return out;
}

async function loadModelSheet(gid) {
  var url = SHEET_BASE + gid;
  var res = await fetch(url);
  var text = await res.text();
  return parseCSVtoObjects(text);
}
