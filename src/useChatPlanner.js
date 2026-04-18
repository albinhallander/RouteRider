import { useState, useCallback, useMemo, useRef } from 'react';
import {
  buildRouteSuggestions,
  enrichSuggestionsWithMapbox,
  formatEta,
  QUICK_DESTINATIONS,
  QUICK_ORIGINS
} from './routeSuggestions.js';
import { draftPickupEmail, suggestedPickupTime, applyUserNote } from './emailDraft.js';

const INITIAL_MESSAGES = [
  {
    id: 'm-greet-1',
    role: 'assistant',
    text: "Hi — I'm RouteRider. Where are you coming from?",
    quickReplies: QUICK_ORIGINS.map(d => d.label)
  }
];

export function useChatPlanner(shippers, activeRoute, sendOutreach) {
  const [phase, setPhase] = useState('awaiting_origin');
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  // Outreach walkthrough state
  const [outreachQueue, setOutreachQueue] = useState([]); // [{ shipperId, draftBody }]
  const [currentIdx, setCurrentIdx] = useState(0);

  // Monotonic token so a stale Mapbox enrichment never overwrites a fresher
  // set of suggestions (e.g. user picks Yes then quickly toggles back).
  const enrichmentId = useRef(0);

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
        text: `Got it — starting from ${value}. And where are you headed?`,
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
        text: `Nice — heading to ${value}. Want me to find backhaul shipments for the trip home?`,
        quickReplies: ['Yes', 'No']
      }
    ]);
    setPhase('awaiting_backhaul_confirm');
  }, [appendMessages]);

  const confirmBackhaul = useCallback(async yes => {
    if (!destination) return;
    const all = await buildRouteSuggestions(destination, shippers, origin);
    const initial = yes ? all : all.slice(0, 1);

    // Show the user reply + a planning bubble immediately; the real route
    // cards are withheld until the routing provider returns so we never
    // paint straight-line, wrong-ETA placeholders.
    appendMessages([
      { role: 'user', text: yes ? 'Yes' : 'No' },
      { role: 'assistant', text: 'Planning real driving times…' }
    ]);
    setPhase('planning');

    const myId = ++enrichmentId.current;
    const enriched = await enrichSuggestionsWithMapbox(initial);
    if (myId !== enrichmentId.current) return; // a newer request replaced us

    setSuggestions(enriched);
    appendMessages([
      {
        role: 'assistant',
        text: yes
          ? 'Here are round-trip options with backhaul pickups on the way home. Pick one to lock it in.'
          : 'No problem — here is the direct round-trip.',
        suggestionIds: enriched.map(r => r.id)
      }
    ]);
    setPhase('showing_suggestions');
  }, [destination, origin, shippers, appendMessages]);

  const pickRoute = useCallback(id => {
    const route = suggestions.find(r => r.id === id);
    if (!route) return;
    setSelectedRouteId(id);

    const hasShippers = route.shipperIds.length > 0;
    appendMessages([
      { role: 'user', text: `Pick ${route.label}` },
      {
        role: 'assistant',
        text: `Locked in ${route.label} — ${route.shipperIds.length} pickup${route.shipperIds.length === 1 ? '' : 's'}, ETA ${formatEta(route.etaMin)}.`
      },
      ...(hasShippers
        ? [{
            role: 'assistant',
            text: 'Should I contact the suppliers?',
            quickReplies: ['Yes', 'No']
          }]
        : [{
            role: 'assistant',
            text: 'No shippers on this route — nothing to send.'
          }])
    ]);
    setPhase(hasShippers ? 'awaiting_outreach_confirm' : 'outreach_complete');
  }, [suggestions, appendMessages]);

  const confirmOutreach = useCallback(yes => {
    if (!yes) {
      appendMessages([
        { role: 'user', text: 'No' },
        { role: 'assistant', text: "OK — I'll skip outreach for now." }
      ]);
      setPhase('outreach_complete');
      return;
    }

    const route = suggestions.find(r => r.id === selectedRouteId);
    if (!route) return;

    const effectiveRoute = {
      ...activeRoute,
      direction: route.direction,
      etaMin: route.etaMin,
      originLabel: route.originLabel,
      destinationLabel: route.destinationLabel
    };
    const queue = route.shipperIds
      .map((sid, i) => {
        const shipper = shippers.find(s => s.id === sid);
        if (!shipper) return null;
        return {
          shipperId: sid,
          draftBody: draftPickupEmail(shipper, effectiveRoute, suggestedPickupTime(i))
        };
      })
      .filter(Boolean);

    if (queue.length === 0) {
      appendMessages([
        { role: 'user', text: 'Yes' },
        { role: 'assistant', text: 'No shippers on this route.' }
      ]);
      setPhase('outreach_complete');
      return;
    }

    const first = queue[0];
    const firstShipper = shippers.find(s => s.id === first.shipperId);

    setOutreachQueue(queue);
    setCurrentIdx(0);
    appendMessages([
      { role: 'user', text: 'Yes' },
      {
        role: 'assistant',
        text: `I'll walk you through ${queue.length} draft${queue.length === 1 ? '' : 's'}. First up: ${firstShipper.company}.`
      },
      {
        role: 'assistant',
        draftBody: first.draftBody,
        draftShipperId: first.shipperId,
        text: `Draft for ${firstShipper.company} — send it, skip, or tell me what to change.`,
        quickReplies: ['Send', 'Skip', 'Edit']
      }
    ]);
    setPhase('drafting_outreach');
  }, [selectedRouteId, suggestions, shippers, activeRoute, appendMessages]);

  const advance = useCallback((nextIdx) => {
    if (nextIdx >= outreachQueue.length) {
      appendMessages([
        { role: 'assistant', text: `Done — processed all ${outreachQueue.length} draft${outreachQueue.length === 1 ? '' : 's'}.` }
      ]);
      setPhase('outreach_complete');
      return;
    }
    const next = outreachQueue[nextIdx];
    const nextShipper = shippers.find(s => s.id === next.shipperId);
    setCurrentIdx(nextIdx);
    appendMessages([
      {
        role: 'assistant',
        draftBody: next.draftBody,
        draftShipperId: next.shipperId,
        text: `Next: ${nextShipper.company}. Send, skip, or edit?`,
        quickReplies: ['Send', 'Skip', 'Edit']
      }
    ]);
    setPhase('drafting_outreach');
  }, [outreachQueue, shippers, appendMessages]);

  const sendCurrentDraft = useCallback(() => {
    const current = outreachQueue[currentIdx];
    if (!current) return;
    const shipper = shippers.find(s => s.id === current.shipperId);
    if (sendOutreach) sendOutreach(current.shipperId, current.draftBody);
    appendMessages([
      { role: 'user', text: 'Send' },
      { role: 'assistant', text: `Sent to ${shipper.company}.` }
    ]);
    advance(currentIdx + 1);
  }, [currentIdx, outreachQueue, shippers, sendOutreach, appendMessages, advance]);

  const skipCurrentDraft = useCallback(() => {
    const current = outreachQueue[currentIdx];
    if (!current) return;
    const shipper = shippers.find(s => s.id === current.shipperId);
    appendMessages([
      { role: 'user', text: 'Skip' },
      { role: 'assistant', text: `Skipped ${shipper.company}.` }
    ]);
    advance(currentIdx + 1);
  }, [currentIdx, outreachQueue, shippers, appendMessages, advance]);

  const startEdit = useCallback(() => {
    appendMessages([
      { role: 'user', text: 'Edit' },
      { role: 'assistant', text: 'What would you like to change? (e.g. "change pickup to 16:00" or a free-form note)' }
    ]);
    setPhase('awaiting_edit');
  }, [appendMessages]);

  const submitEdit = useCallback(text => {
    const value = (text ?? '').trim();
    if (!value) return;
    const current = outreachQueue[currentIdx];
    if (!current) return;
    const shipper = shippers.find(s => s.id === current.shipperId);
    const updated = applyUserNote(current.draftBody, value);
    setOutreachQueue(prev => prev.map((item, i) => i === currentIdx ? { ...item, draftBody: updated } : item));
    appendMessages([
      { role: 'user', text: value },
      {
        role: 'assistant',
        draftBody: updated,
        draftShipperId: current.shipperId,
        text: `Updated draft for ${shipper.company}. Send, skip, or keep editing?`,
        quickReplies: ['Send', 'Skip', 'Edit']
      }
    ]);
    setPhase('drafting_outreach');
  }, [currentIdx, outreachQueue, shippers, appendMessages]);

  const reset = useCallback(() => {
    setPhase('awaiting_origin');
    setMessages(INITIAL_MESSAGES);
    setOrigin(null);
    setDestination(null);
    setSuggestions([]);
    setSelectedRouteId(null);
    setOutreachQueue([]);
    setCurrentIdx(0);
  }, []);

  const selectedRoute = useMemo(
    () => suggestions.find(r => r.id === selectedRouteId) ?? null,
    [suggestions, selectedRouteId]
  );

  return {
    phase,
    messages,
    suggestions,
    selectedRouteId,
    selectedRoute,
    origin,
    destination,
    submitOrigin,
    submitDestination,
    confirmBackhaul,
    pickRoute,
    confirmOutreach,
    sendCurrentDraft,
    skipCurrentDraft,
    startEdit,
    submitEdit,
    reset
  };
}
