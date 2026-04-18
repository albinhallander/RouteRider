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
  ChevronLeft
} from 'lucide-react';
import ChatPanel from './ChatPanel.jsx';
import { useChatPlanner } from './useChatPlanner.js';
import { draftPickupEmail, suggestedPickupTime } from './emailDraft.js';
import { getStationsNearRoute, getRecommendedStops } from './chargingStations.js';

// ─── Route (E4 corridor, south → north) ─────────────────────────────────────
const ROUTE = [
  [57.7088, 11.9746], // Gothenburg
  [57.7400, 12.6000],
  [57.7600, 13.1000],
  [57.7826, 14.1618], // Jönköping
  [57.9800, 14.5000],
  [58.1800, 14.9000],
  [58.4108, 15.6214], // Linköping
  [58.7000, 16.4000],
  [59.0000, 17.0000],
  [59.1955, 17.6252], // Södertälje
  [59.2500, 17.8000],
  [59.3293, 18.0686]  // Stockholm
];


const INITIAL_SHIPPERS = [
  { id: 's-1', company: 'IKEA Distribution',       location: 'Älmhult',    position: [56.5512, 14.1418], score: 92, distanceFromE4: 12, contact: 'logistics@ikea.se',                 cargo: 'Flat-pack furniture · 18 EUR pallets' },
  { id: 's-2', company: 'Husqvarna AB',             location: 'Huskvarna',  position: [57.7906, 14.2750], score: 88, distanceFromE4: 4,  contact: 'freight@husqvarna.com',             cargo: 'Outdoor power equipment · 22 pallets' },
  { id: 's-3', company: 'Toyota Material Handling', location: 'Mjölby',     position: [58.3266, 15.1268], score: 85, distanceFromE4: 6,  contact: 'eu.logistics@toyota-industries.eu', cargo: 'Forklift components · 14 pallets' },
  { id: 's-4', company: 'Saab Aeronautics',         location: 'Linköping',  position: [58.4108, 15.6214], score: 79, distanceFromE4: 2,  contact: 'supply@saab.se',                    cargo: 'Precision components · 8 crates' },
  { id: 's-5', company: 'AstraZeneca',              location: 'Södertälje', position: [59.1620, 17.5920], score: 90, distanceFromE4: 3,  contact: 'pharma.shipping@astrazeneca.com',   cargo: 'Cold-chain pharma · 12 totes' },
  { id: 's-6', company: 'Scania Logistics',         location: 'Södertälje', position: [59.1955, 17.6252], score: 95, distanceFromE4: 1,  contact: 'backhaul@scania.com',               cargo: 'Truck assemblies · 6 units' },
  { id: 's-7', company: 'Spotify Datacenter Ops',  location: 'Stockholm',  position: [59.3600, 18.0150], score: 81, distanceFromE4: 3,  contact: 'datacenter@spotify.com',            cargo: 'Server racks · 4 pallets' }
];

// ─── useLogistics ────────────────────────────────────────────────────────────
function useLogistics() {
  const [shippers, setShippers] = useState(INITIAL_SHIPPERS);
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

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { shippers, activeRoute, outreachLogs, sendOutreach } = useLogistics();
  const [selected, setSelected] = useState(null);
  const [emailBody, setEmailBody] = useState('');
  const [toast, setToast] = useState(null);
  const chat = useChatPlanner(shippers, activeRoute, sendOutreach);
  const { selectedRoute } = chat;

  const [showAllStations, setShowAllStations] = useState(false);

  const hasSuggestions = chat.suggestions.length > 0;
  const routeLocked = !!selectedRoute;
  const showingSuggestions = hasSuggestions && !routeLocked;
  const SELECTED_COLOR = '#10b981';

  const activeRouteCoords = selectedRoute?.routeCoords ?? ROUTE;

  const recommendedStops = useMemo(
    () => routeLocked ? getRecommendedStops(selectedRoute.routeCoords) : [],
    [routeLocked, selectedRoute]
  );

  const nearbyStations = useMemo(
    () => routeLocked ? [] : getStationsNearRoute(activeRouteCoords, { maxKm: 30, hgvOnly: !showAllStations }),
    [routeLocked, activeRouteCoords, showAllStations]
  );

  const effectiveShippers = selectedRoute
    ? shippers.filter(s => selectedRoute.shipperIds.includes(s.id))
    : shippers;

  useEffect(() => {
    if (selected?.type === 'shipper') setEmailBody(generateEmail(selected.data, activeRoute));
  }, [selected, activeRoute]);

  const handleSend = () => {
    if (!selected || selected.type !== 'shipper') return;
    sendOutreach(selected.data.id, emailBody);
    setToast({ msg: `Outreach sent to ${selected.data.company}` });
    setSelected(null);
    window.setTimeout(() => setToast(null), 3200);
  };

  const contactedCount = effectiveShippers.filter(s => s.contacted).length;

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

              {/* Charging plan — only when route is locked */}
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
              <div className="flex-1 overflow-y-auto">
                <div className="px-4 py-2.5 sticky top-0 bg-white border-b border-gray-100 z-10">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    Avsändare · {contactedCount}/{effectiveShippers.length} kontaktade
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {effectiveShippers.map(s => (
                    <ShipperRow
                      key={s.id}
                      shipper={s}
                      onClick={() => setSelected({ type: 'shipper', data: s })}
                    />
                  ))}
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
        {/* Charging station toggle — only shown when no route is locked */}
        {!routeLocked && (
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

          {/* Idle: base E4 corridor before any plan is built */}
          {!hasSuggestions && (
            <>
              <Polyline positions={ROUTE} pathOptions={{ color: '#6b8ef5', weight: 10, opacity: 0.22 }} />
              <Polyline positions={ROUTE} pathOptions={{ color: '#4264FB', weight: 4, opacity: 1, lineJoin: 'round', lineCap: 'round' }} />
            </>
          )}

          {/* Planning: draw every suggestion in its own color. When one is
              locked, fade the rest and turn the winner green with a halo. */}
          {hasSuggestions && chat.suggestions.map(route => {
            const isSelected = routeLocked && route.id === selectedRoute.id;
            const dimmed = routeLocked && !isSelected;
            const color = isSelected ? SELECTED_COLOR : route.color;
            return (
              <Fragment key={route.id}>
                {isSelected && (
                  <Polyline positions={route.routeCoords}
                    pathOptions={{ color: SELECTED_COLOR, weight: 11, opacity: 0.28, lineJoin: 'round', lineCap: 'round' }}
                  />
                )}
                <Polyline positions={route.routeCoords}
                  pathOptions={{
                    color,
                    weight: isSelected ? 5 : 4,
                    opacity: dimmed ? 0.18 : 0.9,
                    dashArray: dimmed ? '4 6' : undefined,
                    lineJoin: 'round',
                    lineCap: 'round'
                  }}
                />
              </Fragment>
            );
          })}

          {/* Charging stations — shown when no route is locked */}
          {nearbyStations.map((station, i) => (
            <Marker
              key={station.osm_id ?? station.ocm_id ?? station.nobil_id ?? i}
              position={[station.lat, station.lng]}
              icon={station.hgv_compatible ? chargingIconHGV : chargingIconEV}
              eventHandlers={{ click: () => setSelected({ type: 'hub', data: station }) }}
            />
          ))}

          {/* Recommended charging stops — shown when a route is locked */}
          {recommendedStops.map(stop => (
            <Marker
              key={`rec-${stop.stopIndex}`}
              position={[stop.lat, stop.lng]}
              icon={chargingStopIcon(stop.stopIndex)}
              eventHandlers={{ click: () => setSelected({ type: 'hub', data: stop }) }}
            />
          ))}

          {/* Idle shippers: plain circles */}
          {!hasSuggestions && shippers.map(s => (
            <CircleMarker key={s.id} center={s.position} radius={8}
              pathOptions={{ color: '#fff', weight: 2, fillColor: s.contacted ? '#9ca3af' : '#4264FB', fillOpacity: 1 }}
              eventHandlers={{ click: () => setSelected({ type: 'shipper', data: s }) }}
            />
          ))}

          {/* While choosing: highlight any shipper touched by at least one suggestion. */}
          {showingSuggestions && shippers.map(s => {
            const inAnyRoute = chat.suggestions.some(r => r.shipperIds.includes(s.id));
            return (
              <CircleMarker key={s.id} center={s.position} radius={inAnyRoute ? 8 : 5}
                pathOptions={{ color: '#fff', weight: 2, fillColor: inAnyRoute ? '#4264FB' : '#d1d5db', fillOpacity: inAnyRoute ? 1 : 0.6 }}
                eventHandlers={{ click: () => setSelected({ type: 'shipper', data: s }) }}
              />
            );
          })}

          {/* Locked route: origin/destination pins + numbered backhaul stops; other shippers dimmed. */}
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
                    pathOptions={{ color: '#fff', weight: 1, fillColor: '#d1d5db', fillOpacity: 0.45 }}
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
function ShipperRow({ shipper, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 text-left transition"
    >
      <span
        className="mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: shipper.contacted ? '#9CA3AF' : '#4264FB' }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{shipper.company}</div>
        <div className="text-xs text-gray-500">{shipper.location} · {shipper.distanceFromE4} km off E4</div>
      </div>
      <div className="flex-shrink-0">
        {shipper.contacted ? (
          <span className="text-[10px] bg-einride/10 text-einride px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
            <CheckCircle2 size={10} /> Sent
          </span>
        ) : (
          <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full font-medium border border-green-100">
            {shipper.score}
          </span>
        )}
      </div>
    </button>
  );
}

function LegendRow({ color, label, square }) {
  return (
    <div className="flex items-center gap-2">
      <span
        style={{ background: color }}
        className={`w-3 h-3 ${square ? 'rounded-sm' : 'rounded-full'} ring-1 ring-black/10`}
      />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
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
        <Tile icon={<Clock size={12} />} label="ETA" value={`${route.etaMin} min`} />
        <Tile icon={<Activity size={12} />} label="Progress" value={`${route.progressPct ?? 0}%`} />
      </div>

      <div className="text-xs text-gray-500 border border-gray-100 bg-gray-50 rounded-lg p-3">
        Payload {route.payloadKg} / {route.capacityKg} kg · backhaul capacity available along E4.
      </div>
    </div>
  );
}
