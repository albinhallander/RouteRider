import { Fragment, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  CircleMarker
} from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Truck,
  Mail,
  Send,
  Leaf,
  MapPin,
  Activity,
  CheckCircle2,
  Radio,
  Gauge,
  Clock,
  ChevronLeft,
  Coffee,
  X
} from 'lucide-react';
import ChatPanel from './ChatPanel.jsx';
import { useChatPlanner } from './useChatPlanner.js';
import { draftPickupEmail, suggestedPickupTime } from './emailDraft.js';
import { getStationsNearRoute, getRecommendedStops } from './chargingStations.js';
import { getRecommendedRestStops } from './restStops.js';
import { formatEta, getShippersNearRoute } from './routeSuggestions.js';
import { COMPANIES } from './companies.js';


// ─── useLogistics ────────────────────────────────────────────────────────────
function useLogistics() {
  const [shippers, setShippers] = useState(COMPANIES);
  const [activeRoute] = useState({
    truckId: 'ER-2814',
    status: 'Empty',
    direction: 'Heading to Stockholm',
    soc: 78,
    etaMin: 142,
    payloadKg: 0,
    capacityKg: 24000
  });
  const [outreachLogs, setOutreachLogs] = useState([]);

  const sendOutreach = useCallback((shipperId, body) => {
    const ts = new Date().toISOString();
    setOutreachLogs(prev => [...prev, { id: `o-${prev.length + 1}`, shipperId, body, ts, status: 'Sent' }]);
    setShippers(prev => prev.map(s => (s.id === shipperId ? { ...s, contacted: true, contactedAt: ts } : s)));
    return { ok: true, ts };
  }, []);

  return { shippers, activeRoute, outreachLogs, sendOutreach };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateEmail(shipper, activeRoute) {
  return draftPickupEmail(shipper, activeRoute, suggestedPickupTime(0));
}

function tierColor(tier) {
  if (tier === 'prio') return '#10b981';
  if (tier === 'possible') return '#4264FB';
  return '#d1d5db';
}

function tierBadgeStyle(tier) {
  if (tier === 'prio') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (tier === 'possible') return 'bg-blue-50 text-blue-700 border-blue-100';
  return 'bg-gray-50 text-gray-500 border-gray-200';
}

// ─── Leaflet icons ────────────────────────────────────────────────────────────
function stopIcon(n) {
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;background:#1d4ed8;border:2.5px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.25);font-size:11px;font-weight:700;color:#fff;font-family:system-ui">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

const originIcon = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;background:#fff;border:3px solid #374151;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const destIcon = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;background:#374151;border:2.5px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

const chargingIconHGV = L.divIcon({
  className: '',
  html: `<div style="width:28px;height:28px;background:#fff;border:2px solid #10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px rgba(0,0,0,0.18);">
    <svg viewBox="0 0 24 24" width="13" height="13" fill="#10b981"><path d="M13 2L3 14h7l-1 8 11-14h-7z"/></svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

const chargingIconEV = L.divIcon({
  className: '',
  html: `<div style="width:20px;height:20px;background:#fff;border:2px solid #9ca3af;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.12);">
    <svg viewBox="0 0 24 24" width="10" height="10" fill="#9ca3af"><path d="M13 2L3 14h7l-1 8 11-14h-7z"/></svg>
  </div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

function chargingStopIcon(n) {
  return L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;background:#059669;border:2.5px solid #fff;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 2px 7px rgba(0,0,0,0.28);">
      <svg viewBox="0 0 24 24" width="11" height="11" fill="#fff"><path d="M13 2L3 14h7l-1 8 11-14h-7z"/></svg>
      <span style="font-size:8px;font-weight:800;color:#fff;line-height:1;font-family:system-ui;margin-top:1px">${n}</span>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function restStopIcon(n) {
  return L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;background:#d97706;border:2.5px solid #fff;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 2px 7px rgba(0,0,0,0.25);">
      <span style="font-size:10px;font-weight:900;color:#fff;font-family:system-ui;line-height:1">P</span>
      <span style="font-size:7px;font-weight:800;color:#fff;line-height:1;font-family:system-ui">${n}</span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { shippers, activeRoute, outreachLogs, sendOutreach } = useLogistics();
  const [selected, setSelected] = useState(null);
  const [emailBody, setEmailBody] = useState('');
  const [toast, setToast] = useState(null);
  const chat = useChatPlanner(shippers, activeRoute, sendOutreach);
  const { selectedRoute } = chat;

  const [showAllStations, setShowAllStations] = useState(false);
  const [skippedIds, setSkippedIds] = useState(new Set());
  const [activeFilter, setActiveFilter] = useState('possible');

  const skipShipper = useCallback(id => setSkippedIds(prev => new Set([...prev, id])), []);
  const unskipShipper = useCallback(id => {
    setSkippedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, []);

  const hasSuggestions = chat.suggestions.length > 0;
  const routeLocked = !!selectedRoute;
  const showingSuggestions = hasSuggestions && !routeLocked;
  const SELECTED_COLOR = '#2563eb'; // Einride blue — shown only once a route is locked

  const effectiveActiveRoute = useMemo(() => {
    if (!selectedRoute) return activeRoute;
    return {
      ...activeRoute,
      direction: selectedRoute.direction,
      etaMin: selectedRoute.etaMin,
      originLabel: selectedRoute.originLabel,
      destinationLabel: selectedRoute.destinationLabel
    };
  }, [activeRoute, selectedRoute]);

  const recommendedStops = useMemo(
    () => (routeLocked ? getRecommendedStops(selectedRoute.routeCoords) : []),
    [routeLocked, selectedRoute]
  );

  const recommendedRestStops = useMemo(
    () => (routeLocked ? getRecommendedRestStops(selectedRoute.routeCoords) : []),
    [routeLocked, selectedRoute]
  );

  const planningCoords = useMemo(
    () => (hasSuggestions ? chat.suggestions.flatMap(r => r.routeCoords) : []),
    [hasSuggestions, chat.suggestions]
  );

  const nearbyStations = useMemo(
    () =>
      showingSuggestions
        ? getStationsNearRoute(planningCoords, { maxKm: 30, hgvOnly: !showAllStations })
        : [],
    [showingSuggestions, planningCoords, showAllStations]
  );

  // When route is locked: all shippers within 40 km of the route polyline,
  // sorted so route picks come first, then by score descending.
  const corridorShippers = useMemo(
    () => selectedRoute
      ? getShippersNearRoute(selectedRoute.routeCoords, shippers, 40)
          .sort((a, b) => {
            const aOnRoute = selectedRoute.shipperIds.includes(a.id) ? 0 : 1;
            const bOnRoute = selectedRoute.shipperIds.includes(b.id) ? 0 : 1;
            return aOnRoute - bOnRoute || b.score - a.score;
          })
      : shippers,
    [selectedRoute, shippers]
  );

  // Tier counts — based on corridor when locked, full list otherwise
  const countBase = selectedRoute ? corridorShippers : shippers;
  const prioCount = useMemo(
    () => countBase.filter(s => !skippedIds.has(s.id) && s.tier === 'prio').length,
    [countBase, skippedIds]
  );
  const possibleCount = useMemo(
    () => countBase.filter(s => !skippedIds.has(s.id) && s.tier === 'possible').length,
    [countBase, skippedIds]
  );
  const allNonSkippedCount = useMemo(
    () => countBase.filter(s => !skippedIds.has(s.id)).length,
    [countBase, skippedIds]
  );

  const displayedShippers = useMemo(() => {
    const base = selectedRoute ? corridorShippers : shippers;
    const pool = base.filter(s =>
      activeFilter === 'skipped' ? skippedIds.has(s.id) : !skippedIds.has(s.id)
    );
    if (activeFilter === 'prio') return pool.filter(s => s.tier === 'prio');
    if (activeFilter === 'possible') return pool.filter(s => s.tier === 'possible');
    if (activeFilter === 'all') return pool;
    return pool;
  }, [selectedRoute, corridorShippers, shippers, skippedIds, activeFilter]);

  useEffect(() => {
    if (selected?.type === 'shipper') setEmailBody(generateEmail(selected.data, effectiveActiveRoute));
  }, [selected, effectiveActiveRoute]);

  const handleSend = () => {
    if (!selected || selected.type !== 'shipper') return;
    sendOutreach(selected.data.id, emailBody);
    setToast({ msg: `Outreach sent to ${selected.data.company}` });
    setSelected(null);
    window.setTimeout(() => setToast(null), 3200);
  };

  const contactedCount = displayedShippers.filter(s => s.contacted).length;

  const [leftW, setLeftW] = useState(320);
  const [rightW, setRightW] = useState(288);
  const dragging = useRef(null);

  const onMouseDown = useCallback((side, e) => {
    e.preventDefault();
    dragging.current = { side, startX: e.clientX, startW: side === 'left' ? leftW : rightW };
    const onMove = mv => {
      const dx = mv.clientX - dragging.current.startX;
      const next = dragging.current.startW + (side === 'left' ? dx : -dx);
      const clamped = Math.min(520, Math.max(180, next));
      side === 'left' ? setLeftW(clamped) : setRightW(clamped);
    };
    const onUp = () => { dragging.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [leftW, rightW]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">

      {/* ── Sidebar ── */}
      <aside style={{ width: leftW }} className="flex-shrink-0 flex flex-col bg-white border-r border-gray-200 shadow-lg z-10 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>

          {/* Detail view */}
          {selected ? (
            <motion.div
              key="detail"
              initial={{ x: -16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -16, opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col h-full overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-100 flex-shrink-0">
                <button
                  onClick={() => setSelected(null)}
                  className="p-1.5 hover:bg-gray-100 rounded-md transition"
                  aria-label="Back"
                >
                  <ChevronLeft size={18} className="text-gray-500" />
                </button>
                <span className="text-sm font-semibold text-gray-800 truncate">
                  {selected.type === 'shipper' ? selected.data.company
                    : selected.type === 'restarea' ? selected.data.name
                    : selected.type === 'hub' ? selected.data.name
                    : activeRoute.truckId}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {selected.type === 'shipper' && (
                  <ShipperPanel
                    shipper={selected.data}
                    body={emailBody}
                    setBody={setEmailBody}
                    onSend={handleSend}
                    alreadySent={!!selected.data.contacted}
                  />
                )}
                {selected.type === 'hub' && <HubPanel hub={selected.data} />}
                {selected.type === 'restarea' && <RestAreaPanel area={selected.data} />}
                {selected.type === 'truck' && <TruckPanel route={selected.data} />}
              </div>
            </motion.div>

          ) : (

            /* Chat view */
            <motion.div
              key="list"
              initial={{ x: 16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 16, opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col h-full overflow-hidden"
            >
              {/* Brand header */}
              <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-2 text-[11px] tracking-widest text-einride uppercase font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-einride animate-pulse" />
                  Einride · Backhaul
                </div>
                <div className="text-lg font-bold text-gray-900 mt-0.5">RouteRider</div>
                {selectedRoute && (
                  <div className="text-xs text-gray-400">{selectedRoute.direction}</div>
                )}
              </div>

              {/* Rastplan — shown when route is locked */}
              {routeLocked && recommendedRestStops.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Coffee size={10} className="text-amber-500" />
                    Rastplan · {recommendedRestStops.length} stopp
                  </div>
                  <div className="space-y-1.5">
                    {recommendedRestStops.map(stop => (
                      <button
                        key={`rest-plan-${stop.stopIndex}`}
                        onClick={() => setSelected({ type: 'restarea', data: stop })}
                        className="w-full flex items-center gap-2 text-left hover:bg-gray-50 rounded-md px-1.5 py-1 transition"
                      >
                        <span className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                          {stop.stopIndex}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-800 truncate">{stop.name}</div>
                          <div className="text-[10px] text-gray-400">
                            {stop.city} · 45 min · vid ~{stop.kmAtStop} km
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Laddplan — shown when route is locked */}
              {routeLocked && (
                <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Zap size={10} className="text-emerald-500" />
                    Laddplan · {recommendedStops.length} stopp
                  </div>
                  {recommendedStops.length === 0 ? (
                    <div className="text-xs text-gray-400">Ingen laddning krävs på denna rutt.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {recommendedStops.map(stop => (
                        <button
                          key={`plan-${stop.stopIndex}`}
                          onClick={() => setSelected({ type: 'hub', data: stop })}
                          className="w-full flex items-center gap-2 text-left hover:bg-gray-50 rounded-md px-1.5 py-1 transition"
                        >
                          <span className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                            {stop.stopIndex}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-800 truncate">{stop.name}</div>
                            <div className="text-[10px] text-gray-400">
                              {stop.max_power_kw ? `${stop.max_power_kw} kW` : 'Effekt okänd'}
                              {stop.operator ? ` · ${stop.operator}` : ''}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Shippers list */}
              <div className="flex-1 overflow-y-auto flex flex-col min-h-0">

                {/* Filter chips */}
                <div className="px-3 py-2 border-b border-gray-100 flex gap-1.5 flex-wrap flex-shrink-0">
                  {[
                    { key: 'prio',     label: 'Prio',     count: prioCount },
                    { key: 'possible', label: 'Möjliga',  count: possibleCount },
                    { key: 'all',      label: 'Alla',     count: allNonSkippedCount },
                    { key: 'skipped',  label: 'Skippade', count: skippedIds.size },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveFilter(tab.key)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                        activeFilter === tab.key
                          ? 'bg-einride text-black'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {tab.label} {tab.count}
                    </button>
                  ))}
                </div>

                <div className="px-4 py-2.5 sticky top-0 bg-white border-b border-gray-100 z-10 flex-shrink-0">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    Avsändare · {contactedCount}/{displayedShippers.length} kontaktade
                  </span>
                </div>

                <div className="divide-y divide-gray-50">
                  {displayedShippers.length === 0 ? (
                    <div className="px-4 py-6 text-xs text-gray-400 text-center">
                      Inga avsändare i detta filter.
                    </div>
                  ) : (
                    displayedShippers.map(s => (
                      <ShipperRow
                        key={s.id}
                        shipper={s}
                        onClick={() => setSelected({ type: 'shipper', data: s })}
                        onSkip={skipShipper}
                        onUnskip={unskipShipper}
                        isSkipped={skippedIds.has(s.id)}
                        onRoute={routeLocked && selectedRoute.shipperIds.includes(s.id)}
                        routeStop={routeLocked ? selectedRoute.shipperIds.indexOf(s.id) + 1 : 0}
                      />
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* ── Left resize handle ── */}
      <div
        onMouseDown={e => onMouseDown('left', e)}
        className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors z-20"
        style={{ background: 'transparent' }}
      />

      {/* ── Map ── */}
      <div className="flex-1 relative">
        {showingSuggestions && (
          <button
            onClick={() => setShowAllStations(v => !v)}
            className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-md border transition"
            style={{
              background: showAllStations ? '#10b981' : '#fff',
              color: showAllStations ? '#fff' : '#374151',
              borderColor: showAllStations ? '#10b981' : '#d1d5db',
            }}
          >
            <Zap size={11} />
            {showAllStations ? 'Alla EV' : 'HGV'}
          </button>
        )}
        <MapContainer
          center={[58.5, 15.5]}
          zoom={6}
          zoomControl
          attributionControl
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20}
          />

          {/* Nothing renders until the chat produces suggestions — map is a
              blank canvas that responds to the conversation. */}

          {/* Planning: draw every suggestion in its own color. Once one is
              locked, hide the rest and turn the winner Einride blue with a
              halo — the map becomes a single clean route. */}
          {hasSuggestions && chat.suggestions
            .filter(route => !routeLocked || route.id === selectedRoute.id)
            .map(route => {
              const isSelected = routeLocked && route.id === selectedRoute.id;
              const color = isSelected ? SELECTED_COLOR : route.color;
              return (
                <Fragment key={route.id}>
                  {isSelected && (
                    <Polyline positions={route.routeCoords}
                      pathOptions={{ color: SELECTED_COLOR, weight: 12, opacity: 0.22, lineJoin: 'round', lineCap: 'round' }}
                    />
                  )}
                  <Polyline positions={route.routeCoords}
                    pathOptions={{
                      color,
                      weight: isSelected ? 5 : 4,
                      opacity: 0.9,
                      lineJoin: 'round',
                      lineCap: 'round'
                    }}
                  />
                </Fragment>
              );
            })}

          {/* Charging stations — shown during route selection */}
          {nearbyStations.map((station, i) => (
            <Marker
              key={station.osm_id ?? station.ocm_id ?? station.nobil_id ?? i}
              position={[station.lat, station.lng]}
              icon={station.hgv_compatible ? chargingIconHGV : chargingIconEV}
              eventHandlers={{ click: () => setSelected({ type: 'hub', data: station }) }}
            />
          ))}

          {/* Recommended charging stops — shown when route is locked */}
          {recommendedStops.map(stop => (
            <Marker
              key={`rec-${stop.stopIndex}`}
              position={[stop.lat, stop.lng]}
              icon={chargingStopIcon(stop.stopIndex)}
              eventHandlers={{ click: () => setSelected({ type: 'hub', data: stop }) }}
            />
          ))}

          {/* Mandatory rest stops — shown when route is locked */}
          {recommendedRestStops.map(stop => (
            <Marker
              key={`rest-${stop.stopIndex}`}
              position={[stop.lat, stop.lng]}
              icon={restStopIcon(stop.stopIndex)}
              eventHandlers={{ click: () => setSelected({ type: 'restarea', data: stop }) }}
            />
          ))}

          {/* While choosing: highlight shippers touched by suggestions */}
          {showingSuggestions && shippers.map(s => {
            const inAnyRoute = chat.suggestions.some(r => r.shipperIds.includes(s.id));
            const isSkipped = skippedIds.has(s.id);
            return (
              <CircleMarker key={s.id} center={s.position}
                radius={inAnyRoute && !isSkipped ? 8 : 5}
                pathOptions={{
                  color: '#fff',
                  weight: 2,
                  fillColor: isSkipped ? '#e5e7eb' : (inAnyRoute ? tierColor(s.tier) : '#d1d5db'),
                  fillOpacity: isSkipped ? 0.25 : (inAnyRoute ? 1 : 0.6)
                }}
                eventHandlers={{ click: () => setSelected({ type: 'shipper', data: s }) }}
              />
            );
          })}

          {/* Locked route: origin/destination + numbered backhaul stops */}
          {routeLocked && (
            <>
              <Marker position={selectedRoute.originCoords} icon={originIcon} />
              <Marker position={selectedRoute.destinationCoords} icon={destIcon} />
              {selectedRoute.shipperIds.map((id, i) => {
                const s = shippers.find(sh => sh.id === id);
                if (!s) return null;
                return (
                  <Marker key={id} position={s.position} icon={stopIcon(i + 1)}
                    eventHandlers={{ click: () => setSelected({ type: 'shipper', data: s }) }}
                  />
                );
              })}
              {shippers
                .filter(s => !selectedRoute.shipperIds.includes(s.id))
                .map(s => (
                  <CircleMarker key={s.id} center={s.position} radius={4}
                    pathOptions={{
                      color: '#fff',
                      weight: 1,
                      fillColor: skippedIds.has(s.id) ? '#f3f4f6' : '#d1d5db',
                      fillOpacity: skippedIds.has(s.id) ? 0.2 : 0.45
                    }}
                    eventHandlers={{ click: () => setSelected({ type: 'shipper', data: s }) }}
                  />
                ))}
            </>
          )}
        </MapContainer>
      </div>

      {/* ── Right resize handle ── */}
      <div
        onMouseDown={e => onMouseDown('right', e)}
        className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors z-20"
        style={{ background: 'transparent' }}
      />

      {/* ── Chat panel (right) ── */}
      <aside style={{ width: rightW }} className="flex-shrink-0 flex flex-col bg-white border-l border-gray-200 shadow-lg z-10 overflow-hidden">
        <ChatPanel
          phase={chat.phase}
          messages={chat.messages}
          suggestions={chat.suggestions}
          selectedRouteId={chat.selectedRouteId}
          onSubmitOrigin={chat.submitOrigin}
          onSubmitDestination={chat.submitDestination}
          onConfirmBackhaul={chat.confirmBackhaul}
          onPickRoute={chat.pickRoute}
          onConfirmOutreach={chat.confirmOutreach}
          onSendCurrentDraft={chat.sendCurrentDraft}
          onSkipCurrentDraft={chat.skipCurrentDraft}
          onStartEdit={chat.startEdit}
          onSubmitEdit={chat.submitEdit}
          onReset={chat.reset}
        />
      </aside>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-einride text-black font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm"
          >
            <CheckCircle2 size={17} strokeWidth={2.5} />
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ShipperRow({ shipper, onClick, onSkip, onUnskip, isSkipped, onRoute, routeStop }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 text-left transition group"
    >
      <span
        className="mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: shipper.contacted ? '#9CA3AF' : isSkipped ? '#e5e7eb' : tierColor(shipper.tier) }}
      />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${isSkipped ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {shipper.company}
        </div>
        <div className="text-xs text-gray-500">{shipper.location} · {shipper.distanceFromE4} km off E4</div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-1">
        {!isSkipped && !shipper.contacted && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onSkip(shipper.id); }}
            onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), onSkip(shipper.id))}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 transition text-gray-400 hover:text-gray-600 cursor-pointer"
            aria-label="Skip"
          >
            <X size={12} />
          </span>
        )}
        {isSkipped ? (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onUnskip(shipper.id); }}
            onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), onUnskip(shipper.id))}
            className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-medium hover:bg-gray-200 transition cursor-pointer"
          >
            Ångra
          </span>
        ) : onRoute ? (
          <span className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
            {routeStop}
          </span>
        ) : shipper.contacted ? (
          <span className="text-[10px] bg-einride/10 text-einride px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
            <CheckCircle2 size={10} /> Sent
          </span>
        ) : (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${tierBadgeStyle(shipper.tier)}`}>
            {shipper.score}
          </span>
        )}
      </div>
    </button>
  );
}

function Tile({ icon, label, value, highlight }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-einride/30 bg-einride/5' : 'border-gray-100 bg-gray-50'}`}>
      <div className="text-[10px] uppercase tracking-wider text-gray-400 flex items-center gap-1">
        {icon} {label}
      </div>
      <div className={`text-sm font-semibold mt-1 ${highlight ? 'text-einride' : 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

function ShipperPanel({ shipper, body, setBody, onSend, alreadySent }) {
  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-einride/10 border border-einride/20 flex items-center justify-center flex-shrink-0">
          <MapPin size={18} className="text-einride" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-gray-400">Shipper</div>
          <h2 className="text-base font-bold text-gray-900 leading-tight">{shipper.company}</h2>
          <div className="text-xs text-gray-500">{shipper.location} · {shipper.distanceFromE4} km off E4</div>
        </div>
        {alreadySent && (
          <span className="text-[10px] uppercase tracking-widest bg-einride/10 text-einride border border-einride/20 rounded-md px-2 py-1 font-semibold flex-shrink-0">
            Contacted
          </span>
        )}
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Tile icon={<Leaf size={12} />} label="Score" value={`${shipper.score}/100`} />
        <Tile icon={<Activity size={12} />} label="Off E4" value={`${shipper.distanceFromE4} km`} />
        <Tile icon={<Mail size={12} />} label="Status" value={alreadySent ? 'Contacted' : 'Open lead'} highlight={alreadySent} />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Cargo</div>
        <div className="text-sm text-gray-700">{shipper.cargo}</div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] uppercase tracking-widest text-gray-400">Generated outreach</div>
          <div className="text-[10px] text-gray-400 truncate ml-2">→ {shipper.contact}</div>
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={10}
          spellCheck={false}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-[12px] leading-relaxed font-mono text-gray-800 focus:outline-none focus:border-einride/50 transition resize-none"
        />
      </div>

      <button
        disabled={alreadySent}
        onClick={onSend}
        className="w-full bg-einride hover:bg-einride/90 active:bg-einride/80 disabled:bg-gray-100 disabled:text-gray-400 text-black font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-2 text-sm"
      >
        <Send size={14} />
        {alreadySent ? 'Already contacted' : 'Send outreach'}
      </button>
    </div>
  );
}

function HubPanel({ hub }) {
  const powerLabel = hub.max_power_kw ? `${hub.max_power_kw} kW` : '—';
  const pointsLabel = hub.charging_points ? `${hub.charging_points} st` : '—';
  const connectors = (hub.connectors ?? []).join(', ') || '—';
  const hours = hub.open_hours || '—';
  const hgvLabel = hub.hgv_compatible ? 'Ja' : 'Nej';

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${hub.hgv_compatible ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
          <Zap size={18} className={hub.hgv_compatible ? 'text-emerald-500' : 'text-amber-500'} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-400">Laddstation</div>
          <h2 className="text-base font-bold text-gray-900 leading-tight">{hub.name}</h2>
          <div className="text-xs text-gray-500">{hub.operator || '—'}</div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Tile icon={<Zap size={12} />} label="Max effekt" value={powerLabel} />
        <Tile icon={<Activity size={12} />} label="Laddpunkter" value={pointsLabel} />
        <Tile icon={<Truck size={12} />} label="HGV" value={hgvLabel} highlight={hub.hgv_compatible} />
        <Tile icon={<Clock size={12} />} label="Öppettider" value={hours} />
      </div>

      {hub.connectors?.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Kontaktorer</div>
          <div className="text-sm text-gray-700">{connectors}</div>
        </div>
      )}

      {hub.address && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Adress</div>
          <div className="text-sm text-gray-700">{hub.address}{hub.postcode ? `, ${hub.postcode}` : ''}</div>
        </div>
      )}
    </div>
  );
}

function RestAreaPanel({ area }) {
  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
          <Coffee size={18} className="text-amber-500" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-400">Rastplats</div>
          <h2 className="text-base font-bold text-gray-900 leading-tight">{area.name}</h2>
          <div className="text-xs text-gray-500">{area.city} · E4</div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Tile icon={<Clock size={12} />} label="Obligatorisk rast" value="45 min" highlight />
        <Tile icon={<Activity size={12} />} label="Vid km" value={area.kmAtStop ? `~${area.kmAtStop} km` : '—'} />
      </div>

      {area.facilities?.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Faciliteter</div>
          <div className="flex flex-wrap gap-1.5">
            {area.facilities.map(f => (
              <span key={f} className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3 leading-relaxed">
        EU 561/2006 kräver 45 min rast efter 4,5h körning. Kan delas upp: 15 + 30 min.
      </div>
    </div>
  );
}

function TruckPanel({ route }) {
  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-einride/10 border border-einride/20 flex items-center justify-center flex-shrink-0">
          <Truck size={18} className="text-einride" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-400">Asset</div>
          <h2 className="text-base font-bold text-gray-900 leading-tight">{route.truckId}</h2>
          <div className="text-xs text-gray-500">{route.direction}</div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Tile icon={<Radio size={12} />} label="Status" value={route.status} highlight />
        <Tile icon={<Gauge size={12} />} label="SoC" value={`${route.soc}%`} />
        <Tile icon={<Clock size={12} />} label="ETA" value={formatEta(route.etaMin)} />
        <Tile icon={<Activity size={12} />} label="Progress" value={`${route.progressPct ?? 0}%`} />
      </div>

      <div className="text-xs text-gray-500 border border-gray-100 bg-gray-50 rounded-lg p-3">
        Payload {route.payloadKg} / {route.capacityKg} kg · backhaul capacity available along E4.
      </div>
    </div>
  );
}
