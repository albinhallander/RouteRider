import signalsData from './data/live_signals.json';

export function getLiveSignals(orgnr) {
  if (!orgnr) return null;
  return signalsData[orgnr] ?? null;
}

export function buildSignalList(sig) {
  if (!sig) return [];
  const list = [];
  if (sig.ted) {
    list.push({
      type: 'ted',
      label: 'Contract expiring',
      detail: sig.ted.description,
      expiry: sig.ted.expiry_month,
      valueSek: sig.ted.value_sek,
    });
  }
  if (sig.load_board?.active) {
    list.push({
      type: 'load_board',
      label: 'Active load posting',
      detail: `${sig.load_board.pallets} pallets · ${sig.load_board.direction}`,
    });
  }
  if (sig.cdp_scope3) {
    list.push({
      type: 'cdp',
      label: 'Scope 3 pressure',
      detail: sig.cdp_scope3.reason,
      pressure: sig.cdp_scope3.pressure,
    });
  }
  return list;
}

export function signalScoreBonus(sig) {
  if (!sig) return 0;
  let bonus = 0;
  if (sig.ted) bonus += 15;
  if (sig.load_board?.active) bonus += 12;
  if (sig.cdp_scope3?.pressure === 'high') bonus += 10;
  if (sig.cdp_scope3?.pressure === 'medium') bonus += 5;
  return bonus;
}
