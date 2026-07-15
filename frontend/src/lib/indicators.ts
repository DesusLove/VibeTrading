type N = number | null;

export function calcMA(data: number[], period: number): N[] {
  const out: N[] = new Array(data.length).fill(null);
  if (data.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  out[period - 1] = sum / period;
  for (let i = period; i < data.length; i++) {
    sum += data[i] - data[i - period];
    out[i] = sum / period;
  }
  return out;
}

export function calcEMA(data: number[], period: number): N[] {
  const k = 2 / (period + 1);
  const out: N[] = new Array(data.length).fill(null);
  if (data.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  let ema = sum / period;
  out[period - 1] = ema;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

export function calcBOLL(data: number[], period = 20, mult = 2) {
  const mid = calcMA(data, period);
  const upper: N[] = new Array(data.length).fill(null);
  const lower: N[] = new Array(data.length).fill(null);
  if (data.length < period) return { upper, mid, lower };

  let sumSq = 0;
  for (let i = 0; i < period; i++) sumSq += data[i] ** 2;
  const sum = mid[period - 1]! * period;
  let s2 = sumSq - (sum * sum) / period;
  const std = Math.sqrt(Math.max(0, s2) / period);
  upper[period - 1] = mid[period - 1]! + mult * std;
  lower[period - 1] = mid[period - 1]! - mult * std;

  for (let i = period; i < data.length; i++) {
    sumSq += data[i] ** 2 - data[i - period] ** 2;
    const newSum = mid[i]! * period;
    s2 = sumSq - (newSum * newSum) / period;
    const s = Math.sqrt(Math.max(0, s2) / period);
    upper[i] = mid[i]! + mult * s;
    lower[i] = mid[i]! - mult * s;
  }
  return { upper, mid, lower };
}

export function calcMACD(data: number[], fast = 12, slow = 26, sig = 9) {
  const ef = calcEMA(data, fast);
  const es = calcEMA(data, slow);
  const dif: N[] = data.map((_, i) =>
    ef[i] !== null && es[i] !== null ? ef[i]! - es[i]! : null
  );

  // Signal = EMA of non-null DIF values
  const valid: number[] = [];
  const idx: number[] = [];
  dif.forEach((v, i) => { if (v !== null) { valid.push(v); idx.push(i); } });
  const sigEma = calcEMA(valid, sig);

  const signal: N[] = new Array(data.length).fill(null);
  const hist: N[] = new Array(data.length).fill(null);
  idx.forEach((ii, j) => {
    if (sigEma[j] !== null) {
      signal[ii] = sigEma[j];
      hist[ii] = dif[ii]! - sigEma[j]!;
    }
  });
  return { dif, signal, histogram: hist };
}

export function calcRSI(data: number[], period = 14): N[] {
  if (data.length < period + 1) return data.map(() => null);
  const out: N[] = new Array(data.length).fill(null);
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= period; i++) {
    const c = data[i] - data[i - 1];
    if (c > 0) avgG += c; else avgL -= c;
  }
  avgG /= period;
  avgL /= period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < data.length; i++) {
    const c = data[i] - data[i - 1];
    avgG = (avgG * (period - 1) + (c > 0 ? c : 0)) / period;
    avgL = (avgL * (period - 1) + (c < 0 ? -c : 0)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

export function calcKDJ(highs: number[], lows: number[], closes: number[], period = 9) {
  const n = closes.length;
  const k: N[] = new Array(n).fill(null);
  const d: N[] = new Array(n).fill(null);
  const j: N[] = new Array(n).fill(null);
  if (n < period) return { k, d, j };

  let hiWin: number[] = [];
  let loWin: number[] = [];

  let pk = 50, pd = 50;
  for (let i = 0; i < n; i++) {
    hiWin.push(highs[i]);
    loWin.push(lows[i]);
    if (hiWin.length > period) {
      hiWin.shift();
      loWin.shift();
    }
    if (i < period - 1) continue;

    let hi = -Infinity, lo = Infinity;
    for (let p = 0; p < period; p++) {
      if (hiWin[p] > hi) hi = hiWin[p];
      if (loWin[p] < lo) lo = loWin[p];
    }
    const rsv = hi === lo ? 50 : ((closes[i] - lo) / (hi - lo)) * 100;
    pk = (pk * 2 + rsv) / 3;
    pd = (pd * 2 + pk) / 3;
    k[i] = pk;
    d[i] = pd;
    j[i] = 3 * pk - 2 * pd;
  }
  return { k, d, j };
}
