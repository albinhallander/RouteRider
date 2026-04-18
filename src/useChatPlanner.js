import { useState, useCallback, useMemo } from 'react';
import { buildRouteSuggestions, QUICK_DESTINATIONS } from './routeSuggestions.js';

const INITIAL_MESSAGES = [
  {
    id: 'm-greet-1',
    role: 'assistant',
    text: "Hi — I'm RouteRider. Where are you going today?",
    quickReplies: QUICK_DESTINATIONS.map(d => d.label)
  }
];

export function useChatPlanner(shippers) {
  const [phase, setPhase] = useState('awaiting_destination');
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [destination, setDestination] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  const push = useCallback(msg => {
    setMessages(prev => [...prev, { ...msg, id: `m-${prev.length + 1}` }]);
  }, []);

  const submitDestination = useCallback(text => {
    const value = (text ?? '').trim();
    if (!value) return;
    setDestination(value);
    setMessages(prev => [
      ...prev,
      { id: `m-${prev.length + 1}`, role: 'user', text: value },
      {
        id: `m-${prev.length + 2}`,
        role: 'assistant',
        text: `Nice — heading to ${value}. Want me to find backhaul shipments along the way?`,
        quickReplies: ['Yes', 'No']
      }
    ]);
    setPhase('awaiting_backhaul_confirm');
  }, []);

  const confirmBackhaul = useCallback(yes => {
    if (!destination) return;
    if (yes) {
      const built = buildRouteSuggestions(destination, shippers);
      setSuggestions(built);
      setMessages(prev => [
        ...prev,
        { id: `m-${prev.length + 1}`, role: 'user', text: 'Yes' },
        {
          id: `m-${prev.length + 2}`,
          role: 'assistant',
          text: 'Here are three routes with backhaul shippers. Pick one to lock it in.',
          suggestionIds: built.map(r => r.id)
        }
      ]);
      setPhase('showing_suggestions');
    } else {
      const direct = buildRouteSuggestions(destination, shippers).slice(0, 1);
      setSuggestions(direct);
      setMessages(prev => [
        ...prev,
        { id: `m-${prev.length + 1}`, role: 'user', text: 'No' },
        {
          id: `m-${prev.length + 2}`,
          role: 'assistant',
          text: 'No problem — here is the direct run.',
          suggestionIds: direct.map(r => r.id)
        }
      ]);
      setPhase('showing_suggestions');
    }
  }, [destination, shippers]);

  const pickRoute = useCallback(id => {
    const route = suggestions.find(r => r.id === id);
    if (!route) return;
    setSelectedRouteId(id);
    setMessages(prev => [
      ...prev,
      { id: `m-${prev.length + 1}`, role: 'user', text: `Pick ${route.label}` },
      {
        id: `m-${prev.length + 2}`,
        role: 'assistant',
        text: `Locked in ${route.label} — ${route.shipperIds.length} pickup${route.shipperIds.length === 1 ? '' : 's'}, ETA ${route.etaMin} min. Click any shipper marker to send an outreach.`
      }
    ]);
    setPhase('route_selected');
  }, [suggestions]);

  const reset = useCallback(() => {
    setPhase('awaiting_destination');
    setMessages(INITIAL_MESSAGES);
    setDestination(null);
    setSuggestions([]);
    setSelectedRouteId(null);
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
    submitDestination,
    confirmBackhaul,
    pickRoute,
    reset
  };
}
