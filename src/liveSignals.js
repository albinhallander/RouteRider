import signalsData from './data/live_signals.json';

export function getLiveSignals(orgnr) {
  if (!orgnr) return null;
  return signalsData[orgnr] ?? null;
}

export function buildSignalList(sig) {
  if (!sig) return [];
  const list = [];
  if (sig.cdp_scope3) {
    list.push({
      type: 'cdp',
      label: 'Scope 3 pressure',
      detail: sig.cdp_scope3.reason,
      pressure: sig.cdp_scope3.pressure,
    });
  }
  if (sig.load_board) {
    list.push({
      type: 'load_board',
      label: `Aktiv på ${sig.load_board.platform}`,
      detail: sig.load_board.reason,
      frequency: sig.load_board.frequency,
      lastPostDate: sig.load_board.last_post_date,
    });
  }
  return list;
}

export function signalScoreBonus(sig) {
  if (!sig) return 0;
  let bonus = 0;
  if (sig.cdp_scope3?.pressure === 'high') bonus += 10;
  if (sig.cdp_scope3?.pressure === 'medium') bonus += 5;
  if (sig.load_board?.frequency === 'high') bonus += 8;
  if (sig.load_board?.frequency === 'medium') bonus += 4;
  return bonus;
}
