export interface DcfParams {
  g1: number;
  g2: number;
  g3: number;
  termG: number;
  discount: number;
  cashFlow: number;
  shares: number;
  netDebt: number;
}

export interface DcfRow {
  year: number;
  growthRate: number;
  cashFlow: number;
  pv: number;
  cumPV: number;
}

export interface DcfResult {
  rows: DcfRow[];
  terminalValue: number;
  terminalPV: number;
  sumPV: number;
  totalPV: number;
  equityValue: number;
  intrinsicValue: number;
}

export function calculateDcf(p: DcfParams): DcfResult | null {
  if (
    !Number.isFinite(p.cashFlow) ||
    !Number.isFinite(p.shares) ||
    p.cashFlow <= 0 ||
    p.shares <= 0 ||
    p.discount <= p.termG
  ) {
    return null;
  }

  const r = p.discount / 100;
  const growthRates = [p.g1 / 100, p.g2 / 100, p.g3 / 100];
  const termG = p.termG / 100;
  const rows: DcfRow[] = [];
  let cashFlow = p.cashFlow;
  let cumulativePv = 0;

  for (let year = 1; year <= 15; year++) {
    const phase = year <= 5 ? 0 : year <= 10 ? 1 : 2;
    cashFlow *= 1 + growthRates[phase];
    const pv = cashFlow / Math.pow(1 + r, year);
    cumulativePv += pv;
    rows.push({
      year,
      growthRate: [p.g1, p.g2, p.g3][phase],
      cashFlow,
      pv,
      cumPV: cumulativePv,
    });
  }

  const terminalValue =
    (rows[14].cashFlow * (1 + termG)) / (r - termG);
  const terminalPV = terminalValue / Math.pow(1 + r, 15);
  const totalPV = cumulativePv + terminalPV;
  const equityValue = totalPV - p.netDebt;

  return {
    rows,
    terminalValue,
    terminalPV,
    sumPV: cumulativePv,
    totalPV,
    equityValue,
    intrinsicValue: equityValue / p.shares,
  };
}