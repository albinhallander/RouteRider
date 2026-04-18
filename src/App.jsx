import { useState, useEffect, useMemo, useCallback } from 'react';
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
  X,
  Leaf,
  MapPin,
  Activity,
  CheckCircle2,
  Radio,
  Gauge,
  Clock
} from 'lucide-react';

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
  { id: 's-1', company: 'IKEA Distribution',          location: 'Älmhult',    position: [56.5512, 14.1418], score: 92, distanceFromE4: 12, contact: 'logistics@ikea.se',                 cargo: 'Flat-pack furniture · 18 EUR pallets' },
  { id: 's-2', company: 'Husqvarna AB',                location: 'Huskvarna',  position: [57.7906, 14.2750], score: 88, distanceFromE4: 4,  contact: 'freight@husqvarna.com',             cargo: 'Outdoor power equipment · 22 pallets' },
  { id: 's-3', company: 'Toyota Material Handling',    location: 'Mjölby',     position: [58.3266, 15.1268], score: 85, distanceFromE4: 6,  contact: 'eu.logistics@toyota-industries.eu', cargo: 'Forklift components · 14 pallets' },
  { id: 's-4', company: 'Saab Aeronautics',            location: 'Linköping',  position: [58.4108, 15.6214], score: 79, distanceFromE4: 2,  contact: 'supply@saab.se',                    cargo: 'Precision components · 8 crates' },
  { id: 's-5', company: 'AstraZeneca',                 location: 'Södertälje', position: [59.1620, 17.5920], score: 90, distanceFromE4: 3,  contact: 'pharma.shipping@astrazeneca.com',   cargo: 'Cold-chain pharma · 12 totes' },
  { id: 's-6', company: 'Scania Logistics',            location: 'Södertälje', position: [59.1955, 17.6252], score: 95, distanceFromE4: 1,  contact: 'backhaul@scania.com',               cargo: 'Truck assemblies · 6 units' },
  { id: 's-7', company: 'Spotify Datacenter Ops',      location: 'Stockholm',  position: [59.3600, 18.0150], score: 81, distanceFromE4: 3,  contact: 'datacenter@spotify.com',            cargo: 'Server racks · 4 pallets' }
];

// ─── useLogistics: local "database" engine ──────────────────────────────────
function useLogistics() {
  const [shippers, setShippers] = useState(INITIAL_SHIPPERS);
  const [activeRoute, setActiveRoute] = useState({
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

  return { shippers, activeRoute, setActiveRoute, outreachLogs, sendOutreach };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function interpolateRoute(points, segmentsPerLeg = 80) {
  const path = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [lat1, lng1] = points[i];
    const [lat2, lng2] = points[i + 1];
    for (let s = 0; s < segmentsPerLeg; s++) {
      const t = s / segmentsPerLeg;
      path.push([lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]);
    }
  }
  path.push(points[points.length - 1]);
  return path;
}

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

// ─── Custom Leaflet icons (divIcon + inline SVG) ────────────────────────────
const truckIcon = L.divIcon({
  className: '',
  html: `
    <div class="truck-marker" style="width:34px;height:34px;background:#5DC1E0;border:2px solid #fff;display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 17h4V5H2v12h3"/>
        <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5"/>
        <circle cx="7.5" cy="17.5" r="2.5"/>
        <circle cx="17.5" cy="17.5" r="2.5"/>
      </svg>
    </div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

const chargingIcon = L.divIcon({
  className: '',
  html: `
    <div style="width:36px;height:36px;background:#FBBF24;border:2px solid #000;border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px rgba(251,191,36,0.55);">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="#000">
        <path d="M13 2L3 14h7l-1 8 11-14h-7z"/>
      </svg>
    </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

// ─── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const { shippers, activeRoute, outreachLogs, sendOutreach } = useLogistics();
  const [selected, setSelected] = useState(null); // { type: 'shipper'|'hub'|'truck', data }
  const [emailBody, setEmailBody] = useState('');
  const [toast, setToast] = useState(null);

  const densePath = useMemo(() => interpolateRoute(ROUTE, 80), []);
  const [truckIdx, setTruckIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTruckIdx(i => (i + 1) % densePath.length), 180);
    return () => clearInterval(id);
  }, [densePath.length]);

  const truckPos = densePath[truckIdx];
  const progressPct = Math.round((truckIdx / densePath.length) * 100);

  useEffect(() => {
    if (selected?.type === 'shipper') {
      setEmailBody(generateEmail(selected.data, activeRoute));
    }
  }, [selected, activeRoute]);

  const handleSend = () => {
    if (!selected || selected.type !== 'shipper') return;
    sendOutreach(selected.data.id, emailBody);
    setToast({ msg: `Outreach sent to ${selected.data.company}`, kind: 'success' });
    setSelected(null);
    window.setTimeout(() => setToast(null), 3200);
  };

  const contactedCount = shippers.filter(s => s.contacted).length;

  return (
    <div className="relative h-screen w-screen bg-black text-white overflow-hidden">
      {/* ───────── Map ───────── */}
      <MapContainer
        center={[58.5, 15.5]}
        zoom={6}
        zoomControl={false}
        attributionControl
        className="absolute inset-0 z-0"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />

        {/* Route glow + line */}
        <Polyline positions={ROUTE} pathOptions={{ color: '#5DC1E0', weight: 14, opacity: 0.12 }} />
        <Polyline positions={ROUTE} pathOptions={{ color: '#5DC1E0', weight: 3.5, opacity: 0.95 }} />

        {/* Truck */}
        {truckPos && (
          <Marker
            position={truckPos}
            icon={truckIcon}
            eventHandlers={{ click: () => setSelected({ type: 'truck', data: { ...activeRoute, progressPct } }) }}
          />
        )}

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
        {shippers.map(s => {
          const color = s.contacted ? '#5DC1E0' : '#10B981';
          return (
            <CircleMarker
              key={s.id}
              center={s.position}
              radius={9}
              pathOptions={{
                color: '#000',
                weight: 2,
                fillColor: color,
                fillOpacity: 0.9
              }}
              eventHandlers={{ click: () => setSelected({ type: 'shipper', data: s }) }}
            />
          );
        })}
      </MapContainer>

      {/* ───────── Top HUD ───────── */}
      <div className="absolute top-0 left-0 right-0 z-10 p-5 pointer-events-none">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="pointer-events-auto bg-black/80 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 shadow-2xl">
            <div className="flex items-center gap-2 text-[11px] tracking-[0.32em] text-einride">
              <span className="w-1.5 h-1.5 rounded-full bg-einride animate-pulse" />
              EINRIDE · BACKHAUL
            </div>
            <div className="text-lg font-semibold leading-tight mt-0.5">RouteRider</div>
            <div className="text-[11px] text-white/50">E4 corridor · Gothenburg → Stockholm</div>
          </div>

          <div className="pointer-events-auto bg-black/80 backdrop-blur-md border border-white/10 rounded-xl px-5 py-3 shadow-2xl flex gap-6">
            <Stat icon={<Truck size={12} />} label="Truck" value={activeRoute.truckId} />
            <Stat icon={<Radio size={12} />} label="Status" value={activeRoute.status} accent />
            <Stat icon={<Gauge size={12} />} label="SoC" value={`${activeRoute.soc}%`} />
            <Stat icon={<Clock size={12} />} label="ETA" value={`${activeRoute.etaMin} min`} />
            <Stat icon={<Mail size={12} />} label="Outreach" value={`${contactedCount}/${shippers.length}`} />
          </div>
        </div>
      </div>

      {/* ───────── Progress bar ───────── */}
      <div className="absolute top-24 right-5 z-10 w-64 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/40 mb-1.5">
          <span>Route progress</span>
          <span className="text-einride">{progressPct}%</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-einride"
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.2, ease: 'linear' }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-white/40">
          <span>GBG</span><span>JKG</span><span>LKP</span><span>SDT</span><span>STO</span>
        </div>
      </div>

      {/* ───────── Legend ───────── */}
      <div className="absolute bottom-5 left-5 z-10 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-3 text-xs space-y-2">
        <LegendRow color="#5DC1E0" label="Active E4 route · truck" />
        <LegendRow color="#10B981" label="Shipper · open" />
        <LegendRow color="#5DC1E0" label="Shipper · contacted" />
        <LegendRow color="#FBBF24" label="Charging hub" square />
      </div>

      {/* ───────── Outreach log ───────── */}
      {outreachLogs.length > 0 && (
        <div className="absolute bottom-5 right-5 z-10 w-72 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-3 max-h-56 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5">
            <Mail size={11} /> Outreach log · {outreachLogs.length}
          </div>
          <div className="space-y-1.5">
            {outreachLogs.slice().reverse().map(log => {
              const sh = shippers.find(s => s.id === log.shipperId);
              return (
                <div key={log.id} className="flex items-center justify-between text-xs border-t border-white/5 pt-1.5">
                  <span className="truncate text-white/80">{sh?.company}</span>
                  <span className="text-einride text-[10px] flex items-center gap-1">
                    <CheckCircle2 size={11} /> Sent
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ───────── Bottom sheet ───────── */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm z-20"
            />
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 z-30 bg-zinc-950 border-t border-white/10 rounded-t-2xl shadow-[0_-20px_60px_rgba(93,193,224,0.08)] max-h-[78vh] overflow-hidden flex flex-col"
            >
              <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-white/5">
                <div className="relative flex items-center justify-center py-3">
                  <div className="w-12 h-1.5 bg-white/20 rounded-full" />
                  <button
                    onClick={() => setSelected(null)}
                    aria-label="Close"
                    className="absolute right-4 p-1.5 rounded-md hover:bg-white/10 transition"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto">
                <div className="p-6 max-w-3xl mx-auto">
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
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ───────── Toast ───────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-einride text-black font-semibold px-5 py-3 rounded-xl shadow-[0_10px_40px_rgba(93,193,224,0.35)] flex items-center gap-2"
          >
            <CheckCircle2 size={18} strokeWidth={2.5} />
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────
function Stat({ icon, label, value, accent }) {
  return (
    <div className="min-w-[56px]">
      <div className="text-[10px] uppercase tracking-widest text-white/40 flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-sm font-semibold mt-0.5 ${accent ? 'text-einride' : ''}`}>{value}</div>
    </div>
  );
}

function LegendRow({ color, label, square }) {
  return (
    <div className="flex items-center gap-2">
      <span
        style={{ background: color }}
        className={`w-3 h-3 ${square ? 'rounded-sm' : 'rounded-full'} ring-1 ring-black/40`}
      />
      <span className="text-white/70">{label}</span>
    </div>
  );
}

function Tile({ icon, label, value, highlight }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-einride/40 bg-einride/5' : 'border-white/10 bg-white/[0.02]'}`}>
      <div className="text-[10px] uppercase tracking-widest text-white/40 flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-sm font-semibold mt-1 ${highlight ? 'text-einride' : ''}`}>{value}</div>
    </div>
  );
}

function ShipperPanel({ shipper, body, setBody, onSend, alreadySent }) {
  return (
    <div className="space-y-5">
      <header className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-lg bg-einride/15 border border-einride/30 flex items-center justify-center">
          <MapPin size={20} className="text-einride" />
        </div>
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-widest text-white/40">Shipper</div>
          <h2 className="text-2xl font-semibold leading-tight">{shipper.company}</h2>
          <div className="text-sm text-white/50">
            {shipper.location} · {shipper.distanceFromE4} km off E4
          </div>
        </div>
        {alreadySent && (
          <span className="text-[10px] uppercase tracking-widest bg-einride/15 text-einride border border-einride/30 rounded-md px-2 py-1">
            Contacted
          </span>
        )}
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Tile icon={<Leaf size={12} />} label="Sustain. score" value={`${shipper.score} / 100`} />
        <Tile icon={<Activity size={12} />} label="Off-corridor" value={`${shipper.distanceFromE4} km`} />
        <Tile
          icon={<Mail size={12} />}
          label="Status"
          value={alreadySent ? 'Contacted' : 'Open lead'}
          highlight={alreadySent}
        />
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-widest text-white/40 mb-1">Cargo brief</div>
        <div className="text-sm text-white/85">{shipper.cargo}</div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-widest text-white/40">Generated outreach</div>
          <div className="text-[10px] text-white/30">→ {shipper.contact}</div>
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={12}
          spellCheck={false}
          className="w-full bg-black border border-white/10 rounded-lg p-3 text-[13px] leading-relaxed font-mono text-white/90 focus:outline-none focus:border-einride/60 transition"
        />
      </div>

      <button
        disabled={alreadySent}
        onClick={onSend}
        className="w-full bg-einride hover:bg-einride/90 active:bg-einride/80 disabled:bg-white/10 disabled:text-white/40 text-black font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
      >
        <Send size={16} />
        {alreadySent ? 'Already contacted' : 'Send outreach'}
      </button>
    </div>
  );
}

function HubPanel({ hub }) {
  return (
    <div className="space-y-5">
      <header className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-lg bg-amber-400/15 border border-amber-400/40 flex items-center justify-center">
          <Zap size={20} className="text-amber-400" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-white/40">Charging hub</div>
          <h2 className="text-2xl font-semibold leading-tight">{hub.name}</h2>
          <div className="text-sm text-white/50">{hub.operator}</div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Tile icon={<Zap size={12} />} label="Capacity" value={hub.capacity} />
        <Tile icon={<Activity size={12} />} label="Status" value={hub.status} highlight />
        <Tile icon={<Clock size={12} />} label="Queue" value={`${hub.queue} truck${hub.queue === 1 ? '' : 's'}`} />
      </div>

      <div className="text-xs text-white/50 border border-white/5 bg-white/[0.02] rounded-lg p-3">
        Reserved for ER-2814 on arrival · projected SoC at plug-in: ~42%
      </div>
    </div>
  );
}

function TruckPanel({ route }) {
  return (
    <div className="space-y-5">
      <header className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-lg bg-einride/15 border border-einride/30 flex items-center justify-center">
          <Truck size={20} className="text-einride" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-white/40">Asset</div>
          <h2 className="text-2xl font-semibold leading-tight">{route.truckId}</h2>
          <div className="text-sm text-white/50">{route.direction}</div>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <Tile icon={<Radio size={12} />} label="Status" value={route.status} highlight />
        <Tile icon={<Gauge size={12} />} label="SoC" value={`${route.soc}%`} />
        <Tile icon={<Clock size={12} />} label="ETA" value={`${route.etaMin} min`} />
        <Tile icon={<Activity size={12} />} label="Progress" value={`${route.progressPct ?? 0}%`} />
      </div>

      <div className="text-xs text-white/50 border border-white/5 bg-white/[0.02] rounded-lg p-3">
        Payload {route.payloadKg} / {route.capacityKg} kg · backhaul capacity available along E4.
      </div>
    </div>
  );
}
