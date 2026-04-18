import { useState, useCallback, useMemo, useRef } from 'react';
import {
  filterFeasibleShippers,
  planRouteFromYes,
  formatEta,
  QUICK_DESTINATIONS,
  QUICK_ORIGINS
} from './routeSuggestions.js';
import { draftPickupEmail, suggestedPickupTime } from './emailDraft.js';

// Phases:
//   awaiting_origin        — waiting for user's origin city
//   awaiting_destination   — waiting for destination
//   computing_feasibility  — OSRM in flight, figuring out who fits
//   showing_feasible_list  — list displayed; user reviews, can trigger "send to all"
//   sending_outreach       — bulk emails firing (microsecond — state just reflects intent)
//   outreach_sent          — user is marking yes/no on shippers; chat offers "plan route"
//   planning_route         — greedy planner running
//   route_planned          — final locked route visible on map
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

  const submitDestination = useCallback(async text => {
    const value = (text ?? '').trim();
    if (!value) return;
    setDestination(value);
    appendMessages([
      { role: 'user', text: value },
      { role: 'assistant', text: `Heading to ${value}. Checking which shippers fit within a 6 h detour…` }
    ]);
    setPhase('computing_feasibility');

    const myId = ++opId.current;
    const result = await filterFeasibleShippers(value, origin, shippers);
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
        text:
          result.feasible.length === 0
            ? `No shippers fit within a 6 h detour on the return to ${result.origin.label}.`
            : `Found ${result.feasible.length} eligible shipper${result.feasible.length === 1 ? '' : 's'} on the return to ${result.origin.label} (sorted by score, all within the 6 h cap). Draft and send an outreach email to all of them?`,
        quickReplies: result.feasible.length ? ['Send to all', 'Not now'] : ['Start over']
      }
    ]);
    setPhase('showing_feasible_list');
  }, [origin, shippers, appendMessages]);

  const sendOutreachToAll = useCallback(() => {
    if (!resolved.current) return;
    const { origin: o, dest: d } = resolved.current;
    const effectiveRoute = {
      ...activeRoute,
      originLabel: o.label,
      destinationLabel: d.label,
      direction: `Return to ${o.label} from ${d.label}`
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
  }, [feasibleIds, shippers, activeRoute, sendOutreach, appendMessages]);

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

    const yesShippers = feasibleIds
      .map(id => shippers.find(s => s.id === id))
      .filter(Boolean)
      .filter(s => s.saidYes === 'yes');

    appendMessages([
      { role: 'user', text: 'Plan route' },
      {
        role: 'assistant',
        text:
          yesShippers.length === 0
            ? 'No shippers marked "yes" yet — I\'ll plan the direct return leg.'
            : `Planning a route that picks up as many of the ${yesShippers.length} yes-shipper${yesShippers.length === 1 ? '' : 's'} as the 6 h cap allows…`
      }
    ]);
    setPhase('planning_route');

    const myId = ++opId.current;
    const route = await planRouteFromYes(o, d, yesShippers, baselineDriving);
    if (myId !== opId.current) return;

    setPlannedRoute(route);
    appendMessages([
      {
        role: 'assistant',
        text: `Locked in · ${route.shipperIds.length} pickup${route.shipperIds.length === 1 ? '' : 's'}, ETA ${formatEta(route.etaMin)} (${formatEta(route.addedMin)} over direct).` +
          (route.skippedIds.length > 0
            ? ` Skipped ${route.skippedIds.length} to stay under 6 h.`
            : '')
      }
    ]);
    setPhase('route_planned');
  }, [feasibleIds, shippers, appendMessages]);

  const reset = useCallback(() => {
    opId.current++; // cancel any pending async
    resolved.current = null;
    setPhase('awaiting_origin');
    setMessages(INITIAL_MESSAGES);
    setOrigin(null);
    setDestination(null);
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
    feasibleShippers,
    plannedRoute,
    // Back-compat aliases so App.jsx / ChatPanel don't need a big rewrite:
    suggestions: plannedRoute ? [plannedRoute] : [],
    selectedRoute: plannedRoute,
    selectedRouteId: plannedRoute?.id ?? null,
    submitOrigin,
    submitDestination,
    sendOutreachToAll,
    declineSendAll,
    requestPlan,
    reset
  };
}
