// Self-contained section that shows carriers typically running a given route.
// Owns its own state (selected carrier, email draft, contacted set) so it can
// be dropped into the sidebar without App.jsx knowing anything about carriers.

import { useState, useEffect } from 'react';
import { Truck, Send, CheckCircle2, ChevronLeft } from 'lucide-react';
import { suggestCarriers, draftCarrierCollabEmail } from './carrierSuggestions.js';

export default function CarrierSection({ originLabel, destinationLabel, activeRoute }) {
  const [selected, setSelected] = useState(null);
  const [body, setBody] = useState('');
  const [contacted, setContacted] = useState({});
  const [toast, setToast] = useState(null);

  const carriers = (originLabel && destinationLabel)
    ? suggestCarriers(originLabel, destinationLabel)
    : [];

  useEffect(() => {
    if (selected && originLabel && destinationLabel) {
      setBody(draftCarrierCollabEmail(
        selected,
        originLabel,
        destinationLabel,
        activeRoute
      ));
    }
  }, [selected, originLabel, destinationLabel, activeRoute]);

  // Reset detail view if the lane changes.
  useEffect(() => { setSelected(null); }, [originLabel, destinationLabel]);

  if (carriers.length === 0) return null;

  const handleSend = () => {
    if (!selected) return;
    setContacted(prev => ({ ...prev, [selected.id]: new Date().toISOString() }));
    setToast(`Collab request sent to ${selected.name}`);
    setSelected(null);
    window.setTimeout(() => setToast(null), 3000);
  };

  if (selected) {
    const already = !!contacted[selected.id];
    return (
      <div className="border-t border-gray-100 bg-white">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
          <button
            onClick={() => setSelected(null)}
            className="p-1 hover:bg-gray-100 rounded-md transition"
            aria-label="Back"
          >
            <ChevronLeft size={16} className="text-gray-500" />
          </button>
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Collaboration · {selected.name}
          </span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-einride/10 border border-einride/20 flex items-center justify-center flex-shrink-0">
              <Truck size={18} className="text-einride" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-gray-400">Carrier</div>
              <h3 className="text-sm font-bold text-gray-900 leading-tight">{selected.name}</h3>
              <div className="text-xs text-gray-500">{selected.hq} · {selected.country} · {selected.fleetTrucks} trucks</div>
            </div>
            {already && (
              <span className="text-[10px] uppercase tracking-widest bg-einride/10 text-einride border border-einride/20 rounded-md px-1.5 py-0.5 font-semibold flex-shrink-0">
                Sent
              </span>
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Specialty</div>
            <div className="text-xs text-gray-700">{selected.specialty}</div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Typical corridors</div>
            <div className="flex flex-wrap gap-1">
              {selected.corridors.map(city => {
                const isEndpoint = city === originLabel || city === destinationLabel;
                return (
                  <span
                    key={city}
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      isEndpoint
                        ? 'bg-einride/10 text-einride border-einride/30 font-semibold'
                        : 'bg-gray-50 text-gray-600 border-gray-200'
                    }`}
                  >
                    {city}
                  </span>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-widest text-gray-400">Collab request</div>
              <div className="text-[10px] text-gray-400 truncate ml-2">→ {selected.contact}</div>
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={11}
              spellCheck={false}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-[11px] leading-relaxed font-mono text-gray-800 focus:outline-none focus:border-einride/50 transition resize-none"
            />
          </div>

          <button
            disabled={already}
            onClick={handleSend}
            className="w-full bg-einride hover:bg-einride/90 active:bg-einride/80 disabled:bg-gray-100 disabled:text-gray-400 text-black font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2 text-sm"
          >
            <Send size={13} />
            {already ? 'Already contacted' : 'Send collab request'}
          </button>
        </div>

        {toast && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 bg-einride text-black font-semibold px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-xs">
            <CheckCircle2 size={14} /> {toast}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 flex-shrink-0">
      <div className="px-4 py-2.5 sticky top-0 bg-white border-b border-gray-100 z-10">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          <Truck size={11} />
          Carriers on this lane · {carriers.length}
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5 normal-case tracking-normal font-normal">
          Regularly run {originLabel} ⇄ {destinationLabel}
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {carriers.map(c => {
          const isSent = !!contacted[c.id];
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 text-left transition"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{c.name}</div>
                <div className="text-xs text-gray-500">{c.hq} · {c.country} · {c.fleetTrucks} trucks</div>
              </div>
              <div className="flex-shrink-0">
                {isSent ? (
                  <span className="text-[10px] bg-einride/10 text-einride px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                    <CheckCircle2 size={10} /> Sent
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border bg-gray-50 text-gray-600 border-gray-200">
                    {c.matchType === 'full' ? 'Direct' : 'Partial'}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
