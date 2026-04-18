import { useState, useEffect, useCallback } from 'react';
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

// ─── Route (E4 corridor, south → north) ─────────────────────────────────────
const ROUTE = [
  [57.7088, 11.9746], // Gothenburg (start)
  [57.7826, 14.1618], // Jönköping
  [58.4108, 15.6214], // Linköping
  [59.1955, 17.6252], // Södertälje
  [59.3293, 18.0686]  // Stockholm (end)
];

const CHARGING_HUBS = [
  {
    id: 'ch-1',
    name: 'OKQ8 / Tesla Megacharger',
    operator: 'OKQ8 · Tesla',
    position: [57.7826, 14.1618],
    capacity: '350 kW × 6 bays',
    status: 'Available',
    queue: 0
  },
  {
    id: 'ch-2',
    name: 'Stockholm Energy Hub',
    operator: 'Tesla Supercharger',
    position: [59.3293, 18.0686],
    capacity: '250 kW × 12 bays',
    status: 'Available',
    queue: 1
  }
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
  const today = new Date().toLocaleDateString('sv-SE');
  return `Subject: Backhaul capacity Gothenburg → Stockholm · ${today}

Hi ${shipper.company} team,

We're operating a zero-emission 40-ton electric truck (${activeRoute.truckId}) currently ${activeRoute.direction.toLowerCase()} along the E4. Based on your location in ${shipper.location} (${shipper.distanceFromE4} km off corridor), we can offer a same-day backhaul slot at ~35% below standard freight.

  Capacity:  up to 22 EUR pallets / 24 ton
  Pickup:    today, 14:00 – 16:00
  CO₂:       0 g tailpipe — sustainability uplift score ${shipper.score}/100
  Cargo fit: ${shipper.cargo}

Reply YES to lock this slot — our ops team will confirm within 5 minutes.

— RouteRider · Einride Backhaul`;
}

// ─── Leaflet icons ────────────────────────────────────────────────────────────
const chargingIcon = L.divIcon({
  className: '',
  html: `
    <div style="width:36px;height:36px;background:#FBBF24;border:2px solid #fff;border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="#000">
        <path d="M13 2L3 14h7l-1 8 11-14h-7z"/>
      </svg>
    </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { shippers, activeRoute, outreachLogs, sendOutreach } = useLogistics();
  const [selected, setSelected] = useState(null);
  const [emailBody, setEmailBody] = useState('');
  const [toast, setToast] = useState(null);
  const [chatCollapsed, setChatCollapsed] = useState(false);

  const chat = useChatPlanner(shippers);
  const { selectedRoute } = chat;

  const effectiveRoute = selectedRoute?.routeCoords ?? ROUTE;
  const effectiveShippers = selectedRoute
    ? shippers.filter(s => selectedRoute.shipperIds.includes(s.id))
    : shippers;

  const progressPct = activeRoute.soc;

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

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">

      {/* ── Sidebar ── */}
      <aside className="w-80 flex-shrink-0 flex flex-col bg-white border-r border-gray-200 shadow-lg z-10 overflow-hidden">
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

            /* Default list view */
            <motion.div
              key="list"
              initial={{ x: 16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 16, opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col h-full overflow-hidden"
            >
              {/* Brand header */}
              <div className="px-4 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2 text-[11px] tracking-widest text-einride uppercase font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-einride animate-pulse" />
                  Einride · Backhaul
                </div>
                <div className="text-xl font-bold text-gray-900 mt-0.5">RouteRider</div>
                <div className="text-xs text-gray-400">
                  {selectedRoute ? selectedRoute.direction : 'E4 · Göteborg → Stockholm'}
                </div>
              </div>

              {/* Truck card */}
              <div className="px-4 py-3 border-b border-gray-100">
                <button
                  className="w-full text-left bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-3 transition"
                  onClick={() => setSelected({ type: 'truck', data: { ...activeRoute, progressPct } })}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Truck size={14} className="text-einride" />
                      <span className="text-sm font-semibold text-gray-900">{activeRoute.truckId}</span>
                    </div>
                    <span className="text-[11px] bg-einride/10 text-einride px-2 py-0.5 rounded-full font-semibold">
                      {activeRoute.status}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500 mb-2.5">
                    <span className="flex items-center gap-1"><Gauge size={11} />{activeRoute.soc}% SoC</span>
                    <span className="flex items-center gap-1"><Clock size={11} />ETA {activeRoute.etaMin} min</span>
                    <span className="flex items-center gap-1"><Mail size={11} />{contactedCount}/{effectiveShippers.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                    <span>Route progress</span>
                    <span className="text-einride font-semibold">{progressPct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-einride rounded-full"
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 0.2, ease: 'linear' }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[9px] text-gray-400">
                    <span>GBG</span><span>JKG</span><span>LKP</span><span>SDT</span><span>STO</span>
                  </div>
                </button>
              </div>

              {/* Shippers list */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-4 py-2.5 sticky top-0 bg-white border-b border-gray-100 z-10">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    Shippers · {contactedCount}/{effectiveShippers.length} contacted
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

              {/* Outreach log */}
              {outreachLogs.length > 0 && (
                <div className="border-t border-gray-100 px-4 py-3 max-h-36 overflow-y-auto bg-gray-50">
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                    <Mail size={11} /> Outreach log · {outreachLogs.length}
                  </div>
                  <div className="space-y-1.5">
                    {outreachLogs.slice().reverse().map(log => {
                      const sh = shippers.find(s => s.id === log.shipperId);
                      return (
                        <div key={log.id} className="flex items-center justify-between text-xs">
                          <span className="truncate text-gray-700 mr-2">{sh?.company}</span>
                          <span className="text-einride text-[10px] flex items-center gap-1 flex-shrink-0">
                            <CheckCircle2 size={10} /> Sent
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Legend */}
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 space-y-1.5">
                <LegendRow color="#5DC1E0" label="E4 route · truck" />
                <LegendRow color="#10B981" label="Shipper · open" />
                <LegendRow color="#5DC1E0" label="Shipper · contacted" />
                <LegendRow color="#FBBF24" label="Charging hub" square />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* ── Map + chat ── */}
      <div className="flex-1 relative">
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

          {/* Route */}
          <Polyline positions={effectiveRoute} pathOptions={{ color: '#5DC1E0', weight: 16, opacity: 0.18 }} />
          <Polyline positions={effectiveRoute} pathOptions={{ color: '#5DC1E0', weight: 4, opacity: 1 }} />

          {/* Charging hubs */}
          {CHARGING_HUBS.map(hub => (
            <Marker
              key={hub.id}
              position={hub.position}
              icon={chargingIcon}
              eventHandlers={{ click: () => setSelected({ type: 'hub', data: hub }) }}
            />
          ))}

          {/* Shippers */}
          {effectiveShippers.map(s => (
            <CircleMarker
              key={s.id}
              center={s.position}
              radius={9}
              pathOptions={{
                color: '#fff',
                weight: 2.5,
                fillColor: s.contacted ? '#5DC1E0' : '#10B981',
                fillOpacity: 0.95
              }}
              eventHandlers={{ click: () => setSelected({ type: 'shipper', data: s }) }}
            />
          ))}
        </MapContainer>

        {/* Chat panel — overlays the map pane */}
        <ChatPanel
          phase={chat.phase}
          messages={chat.messages}
          suggestions={chat.suggestions}
          selectedRouteId={chat.selectedRouteId}
          onSubmitDestination={chat.submitDestination}
          onConfirmBackhaul={chat.confirmBackhaul}
          onPickRoute={chat.pickRoute}
          onReset={chat.reset}
          collapsed={chatCollapsed}
          onToggleCollapse={() => setChatCollapsed(c => !c)}
        />
      </div>

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
        style={{ background: shipper.contacted ? '#5DC1E0' : '#10B981' }}
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
  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
          <Zap size={18} className="text-amber-500" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-400">Charging hub</div>
          <h2 className="text-base font-bold text-gray-900 leading-tight">{hub.name}</h2>
          <div className="text-xs text-gray-500">{hub.operator}</div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Tile icon={<Zap size={12} />} label="Capacity" value={hub.capacity} />
        <Tile icon={<Activity size={12} />} label="Status" value={hub.status} highlight />
        <Tile icon={<Clock size={12} />} label="Queue" value={`${hub.queue} truck${hub.queue === 1 ? '' : 's'}`} />
      </div>

      <div className="text-xs text-gray-500 border border-gray-100 bg-gray-50 rounded-lg p-3">
        Reserved for ER-2814 on arrival · projected SoC at plug-in: ~42%
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
        <Tile icon={<Clock size={12} />} label="ETA" value={`${route.etaMin} min`} />
        <Tile icon={<Activity size={12} />} label="Progress" value={`${route.progressPct ?? 0}%`} />
      </div>

      <div className="text-xs text-gray-500 border border-gray-100 bg-gray-50 rounded-lg p-3">
        Payload {route.payloadKg} / {route.capacityKg} kg · backhaul capacity available along E4.
      </div>
    </div>
  );
}
