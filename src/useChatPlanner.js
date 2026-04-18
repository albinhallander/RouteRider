import { useState, useCallback, useMemo, useRef } from 'react';
import {
  filterFeasibleShippers,
  planRouteFromYes,
  formatEta,
  QUICK_DESTINATIONS,
  QUICK_ORIGINS
} from './routeSuggestions.js';
import { draftPickupEmail, draftConfirmationEmail, suggestedPickupTime } from './emailDraft.js';

// Phases:
//   awaiting_origin           — waiting for user's origin city
//   awaiting_destination      — waiting for destination
//   awaiting_pallet_capacity  — waiting for capacity in EUR pallets
//   awaiting_weight_kg        — waiting for max cargo weight in kg
//   computing_feasibility     — OSRM in flight, figuring out who fits
//   showing_feasible_list     — list displayed; user reviews, can trigger "send to all"
//   sending_outreach          — bulk emails firing (microsecond — state just reflects intent)
//   outreach_sent             — user is marking yes/no on shippers; chat offers "plan route"
//   planning_route            — greedy planner running
//   route_planned             — final locked route visible on map
const INITIAL_MESSAGES = [
  {
    id: 'm-greet-1',
    role: 'assistant',
    text: "Hi — I'm RouteRider. Where are you coming from?",
    quickReplies: QUICK_ORIGINS.map(d => d.label)
  }
];

export function useChatPlanner(shippers, activeRoute, sendOutreach, setSaidYes) {
  const [phase, setPhase] = useState('awaiting_origin');
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [palletCapacity, setPalletCapacity] = useState(null);
  const [maxWeightKg, setMaxWeightKg] = useState(null);

  // Resolved geocoded origin/dest + baseline driving from filterFeasibleShippers
  // — held in a ref so we don't re-geocode for the final route plan.
  const resolved = useRef(null);

  const [feasibleIds, setFeasibleIds] = useState([]);       // score-sorted shipper IDs that fit the cap
  const [feasibleMeta, setFeasibleMeta] = useState({});     // id → { addedMin }
  const [plannedRoute, setPlannedRoute] = useState(null);

  const opId = useRef(0); // guards against stale async writes

  const appendMessages = useCallback((newMsgs) => {
    setMessages(prev => {
      let i = prev.length;
      return [...prev, ...newMsgs.map(m => ({ ...m, id: `m-${++i}` }))];
    });
  }, []);

  const submitOrigin = useCallback(text => {
    const value = (text ?? '').trim();
    if (!value) return;
    setOrigin(value);
    appendMessages([
      { role: 'user', text: value },
      {
        role: 'assistant',
        text: `Starting from ${value}. Where are you headed?`,
        quickReplies: QUICK_DESTINATIONS.map(d => d.label)
      }
    ]);
    setPhase('awaiting_destination');
  }, [appendMessages]);

  const submitDestination = useCallback(text => {
    const value = (text ?? '').trim();
    if (!value) return;
    setDestination(value);
    appendMessages([
      { role: 'user', text: value },
      {
        role: 'assistant',
        text: `Heading to ${value}. How many EUR pallets can you carry on the backhaul leg?`,
        quickReplies: ['22', '33', '44']
      }
    ]);
    setPhase('awaiting_pallet_capacity');
  }, [appendMessages]);

  const submitPalletCapacity = useCallback(text => {
    const n = parseInt(String(text ?? '').replace(/\D+/g, ''), 10);
    if (!Number.isFinite(n) || n <= 0) {
      appendMessages([
        { role: 'user', text: String(text ?? '') },
        { role: 'assistant', text: "That didn't look like a pallet count — give me a whole number (e.g. 33).", quickReplies: ['22', '33', '44'] }
      ]);
      return;
    }
    setPalletCapacity(n);
    appendMessages([
      { role: 'user', text: `${n} pallets` },
      {
        role: 'assistant',
        text: `Got it — ${n} pallet${n === 1 ? '' : 's'} of capacity. What's the maximum cargo weight you can carry, in kg?`,
        quickReplies: ['12000', '18000', '24000']
      }
    ]);
    setPhase('awaiting_weight_kg');
  }, [appendMessages]);

  const submitWeightKg = useCallback(async text => {
    const n = parseInt(String(text ?? '').replace(/\D+/g, ''), 10);
    if (!Number.isFinite(n) || n <= 0) {
      appendMessages([
        { role: 'user', text: String(text ?? '') },
        { role: 'assistant', text: "I need a weight in kg as a number (e.g. 24000).", quickReplies: ['12000', '18000', '24000'] }
      ]);
      return;
    }
    setMaxWeightKg(n);
    appendMessages([
      { role: 'user', text: `${n.toLocaleString('sv-SE')} kg` },
      { role: 'assistant', text: `Max ${n.toLocaleString('sv-SE')} kg noted. Checking which shippers fit within a 6 h detour and scanning live freight signals…` }
    ]);
    setPhase('computing_feasibility');

    const myId = ++opId.current;
    const result = await filterFeasibleShippers(destination, origin, shippers);
    if (myId !== opId.current) return;

    resolved.current = {
      origin: result.origin,
      dest: result.dest,
      baselineDriving: result.baselineDriving
    };

    const meta = {};
    for (const s of result.feasible) meta[s.id] = { addedMin: s.addedMin };
    setFeasibleIds(result.feasible.map(s => s.id));
    setFeasibleMeta(meta);

    appendMessages([
      {
        role: 'assistant',
        text: (() => {
          if (result.feasible.length === 0) {
            return `No shippers fit within a 6 h detour on the return to ${result.origin.label}.`;
          }
          const withSignals = result.feasible.filter(s => {
            const sh = shippers.find(x => x.id === s.id);
            return sh?.signals?.length > 0;
          }).length;
          const signalNote = withSignals > 0 ? ` (${withSignals} with live freight signals)` : '';
          return `Found ${result.feasible.length} eligible shipper${result.feasible.length === 1 ? '' : 's'}${signalNote} on the return to ${result.origin.label}. Draft and send outreach to all of them?`;
        })(),
        quickReplies: result.feasible.length ? ['Send to all', 'Not now'] : ['Start over']
      }
    ]);
    setPhase('showing_feasible_list');
  }, [destination, origin, shippers, appendMessages]);

  const sendOutreachToAll = useCallback(() => {
    if (!resolved.current) return;
    const { origin: o, dest: d } = resolved.current;
    const effectiveRoute = {
      ...activeRoute,
      originLabel: o.label,
      destinationLabel: d.label,
      direction: `Return to ${o.label} from ${d.label}`,
      palletCapacity,
      maxWeightKg
    };

    let sentCount = 0;
    feasibleIds.forEach((sid, i) => {
      const shipper = shippers.find(s => s.id === sid);
      if (!shipper) return;
      const body = draftPickupEmail(shipper, effectiveRoute, suggestedPickupTime(i));
      if (sendOutreach) sendOutreach(sid, body);
      sentCount++;
    });

    appendMessages([
      { role: 'user', text: 'Send to all' },
      {
        role: 'assistant',
        text: `Sent outreach to ${sentCount} shipper${sentCount === 1 ? '' : 's'}. Mark which ones said yes in the list on the left, then tell me to plan the route.`,
        quickReplies: ['Plan route']
      }
    ]);
    setPhase('outreach_sent');
  }, [feasibleIds, shippers, activeRoute, sendOutreach, appendMessages, palletCapacity, maxWeightKg]);

  const declineSendAll = useCallback(() => {
    appendMessages([
      { role: 'user', text: 'Not now' },
      { role: 'assistant', text: "OK — no outreach sent. Say 'plan route' whenever you're ready." }
    ]);
    setPhase('outreach_sent'); // user can still plan from any yes-marked shippers
  }, [appendMessages]);

  const requestPlan = useCallback(async () => {
    if (!resolved.current) return;
    const { origin: o, dest: d, baselineDriving } = resolved.current;

    // Yes-shippers must have cargo filled in (pallets + weight) — otherwise
    // the planner can't evaluate the capacity caps. We quietly drop any that
    // are incomplete and tell the user about them in the summary.
    const allYes = feasibleIds
      .map(id => shippers.find(s => s.id === id))
      .filter(Boolean)
      .filter(s => s.saidYes === 'yes');
    const withCargo = allYes.filter(
      s => Number.isFinite(Number(s.pallets)) && Number.isFinite(Number(s.weightKg))
    );
    const missingCargoCount = allYes.length - withCargo.length;

    appendMessages([
      { role: 'user', text: 'Plan route' },
      {
        role: 'assistant',
        text:
          withCargo.length === 0
            ? 'No yes-shippers with cargo filled in yet — planning the direct return leg.'
            : `Planning a route across ${withCargo.length} yes-shipper${withCargo.length === 1 ? '' : 's'}, capped at 6 h detour · ${palletCapacity ?? '∞'} pallets · ${(maxWeightKg ?? 0).toLocaleString('sv-SE')} kg…`
      }
    ]);
    setPhase('planning_route');

    const myId = ++opId.current;
    const route = await planRouteFromYes(o, d, withCargo, baselineDriving, {
      palletCapacity: palletCapacity ?? Infinity,
      maxWeightKg:    maxWeightKg    ?? Infinity
    });
    if (myId !== opId.current) return;

    setPlannedRoute(route);

    const parts = [
      `Locked in · ${route.shipperIds.length} pickup${route.shipperIds.length === 1 ? '' : 's'}`,
      `ETA ${formatEta(route.etaMin)} (${formatEta(route.addedMin)} over direct)`
    ];
    if (route.palletsUsed != null && route.palletCapacity != null) {
      parts.push(`${route.palletsUsed}/${route.palletCapacity} pallets`);
    }
    if (route.weightKgUsed != null && route.maxWeightKg != null) {
      parts.push(`${route.weightKgUsed.toLocaleString('sv-SE')}/${route.maxWeightKg.toLocaleString('sv-SE')} kg`);
    }
    let summary = parts.join(' · ') + '.';
    if (route.skippedIds.length > 0) summary += ` Skipped ${route.skippedIds.length} to respect the caps.`;
    if (missingCargoCount > 0) summary += ` ${missingCargoCount} yes-shipper${missingCargoCount === 1 ? '' : 's'} ignored — no cargo filled in.`;

    const hasPickups = route.shipperIds.length > 0;
    appendMessages([
      { role: 'assistant', text: summary },
      hasPickups
        ? {
            role: 'assistant',
            text: `Want me to send pickup-confirmation emails to the ${route.shipperIds.length} selected supplier${route.shipperIds.length === 1 ? '' : 's'}?`,
            quickReplies: ['Send confirmations', 'Skip']
          }
        : {
            role: 'assistant',
            text: 'No suppliers on this route — nothing to confirm.'
          }
    ]);
    setPhase(hasPickups ? 'awaiting_confirmation_decision' : 'route_planned');
  }, [feasibleIds, shippers, appendMessages, palletCapacity, maxWeightKg]);

  const sendConfirmations = useCallback(() => {
    if (!resolved.current || !plannedRoute) return;
    const { origin: o, dest: d } = resolved.current;
    const effectiveRoute = {
      ...activeRoute,
      truckId: activeRoute.truckId,
      originLabel: o.label,
      destinationLabel: d.label,
      direction: `Return to ${o.label} from ${d.label}`,
      palletCapacity,
      maxWeightKg
    };

    let sent = 0;
    plannedRoute.shipperIds.forEach((sid, i) => {
      const shipper = shippers.find(s => s.id === sid);
      if (!shipper) return;
      const body = draftConfirmationEmail(shipper, effectiveRoute, suggestedPickupTime(i));
      if (sendOutreach) sendOutreach(sid, body);
      sent++;
    });

    appendMessages([
      { role: 'user', text: 'Send confirmations' },
      { role: 'assistant', text: `Confirmed with ${sent} supplier${sent === 1 ? '' : 's'}. The route is live.` }
    ]);
    setPhase('route_planned');
  }, [plannedRoute, shippers, activeRoute, sendOutreach, appendMessages, palletCapacity, maxWeightKg]);

  const skipConfirmations = useCallback(() => {
    appendMessages([
      { role: 'user', text: 'Skip' },
      { role: 'assistant', text: "OK — no confirmations sent. You can reach out manually any time." }
    ]);
    setPhase('route_planned');
  }, [appendMessages]);

  const reset = useCallback(() => {
    opId.current++; // cancel any pending async
    resolved.current = null;
    setPhase('awaiting_origin');
    setMessages(INITIAL_MESSAGES);
    setOrigin(null);
    setDestination(null);
    setPalletCapacity(null);
    setMaxWeightKg(null);
    setFeasibleIds([]);
    setFeasibleMeta({});
    setPlannedRoute(null);
  }, []);

  // Derived: the list of shippers the sidebar should show. Feasible ones in
  // score order; empty before destination is submitted.
  const feasibleShippers = useMemo(() => {
    return feasibleIds
      .map(id => {
        const s = shippers.find(x => x.id === id);
        if (!s) return null;
        return { ...s, ...feasibleMeta[id] };
      })
      .filter(Boolean);
  }, [feasibleIds, shippers, feasibleMeta]);

  return {
    phase,
    messages,
    origin,
    destination,
    palletCapacity,
    maxWeightKg,
    feasibleShippers,
    plannedRoute,
    // Back-compat aliases so App.jsx / ChatPanel don't need a big rewrite:
    suggestions: plannedRoute ? [plannedRoute] : [],
    selectedRoute: plannedRoute,
    selectedRouteId: plannedRoute?.id ?? null,
    submitOrigin,
    submitDestination,
    submitPalletCapacity,
    submitWeightKg,
    sendOutreachToAll,
    declineSendAll,
    requestPlan,
    sendConfirmations,
    skipConfirmations,
    reset
  };
}
