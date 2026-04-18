import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Bot, User, Leaf, Clock, Truck, Coins, RotateCcw
} from 'lucide-react';

export default function ChatPanel({
  phase,
  messages,
  suggestions,
  selectedRouteId,
  onSubmitDestination,
  onConfirmBackhaul,
  onPickRoute,
  onReset,
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, suggestions]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2.5 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-einride/10 border border-einride/20 flex items-center justify-center flex-shrink-0">
          <Bot size={14} className="text-einride" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-einride font-semibold leading-none">Route planner</div>
          <div className="text-xs font-semibold text-gray-800 mt-0.5">Backhaul Assistant</div>
        </div>
        {phase === 'route_selected' && (
          <button
            onClick={onReset}
            title="Plan again"
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
          >
            <RotateCcw size={13} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50 min-h-0">
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              suggestions={suggestions}
              selectedRouteId={selectedRouteId}
              onQuickReply={text => {
                if (phase === 'awaiting_destination') onSubmitDestination(text);
                else if (phase === 'awaiting_backhaul_confirm') onConfirmBackhaul(text === 'Yes');
              }}
              onPickRoute={onPickRoute}
              phase={phase}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Input */}
      <ChatInput phase={phase} onSubmit={onSubmitDestination} />
    </div>
  );
}

function MessageBubble({ msg, suggestions, selectedRouteId, onQuickReply, onPickRoute, phase }) {
  const isUser = msg.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-einride/10 border border-einride/20 flex items-center justify-center shrink-0 mt-0.5">
          <Bot size={11} className="text-einride" />
        </div>
      )}
      <div className={`flex flex-col gap-2 ${msg.suggestionIds ? 'w-full' : 'max-w-[85%]'} ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-xl px-3 py-2 text-xs leading-relaxed border ${
          isUser
            ? 'bg-einride/10 border-einride/30 text-einride font-medium'
            : 'bg-white border-gray-200 text-gray-800 shadow-sm'
        }`}>
          {msg.text}
        </div>

        {msg.quickReplies && phase !== 'route_selected' && (
          <div className="flex flex-wrap gap-1.5">
            {msg.quickReplies.map(r => (
              <button
                key={r}
                onClick={() => onQuickReply(r)}
                className="text-xs px-2.5 py-1 rounded-full border border-einride/40 text-einride bg-white hover:bg-einride/10 transition font-medium"
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {msg.suggestionIds && (
          <div className="w-full flex flex-col gap-2">
            {msg.suggestionIds
              .map(id => suggestions.find(s => s.id === id))
              .filter(Boolean)
              .map(route => (
                <SuggestionCard
                  key={route.id}
                  route={route}
                  selected={route.id === selectedRouteId}
                  disabled={!!selectedRouteId}
                  onPick={() => onPickRoute(route.id)}
                />
              ))}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
          <User size={11} className="text-gray-500" />
        </div>
      )}
    </motion.div>
  );
}

function SuggestionCard({ route, selected, disabled, onPick }) {
  return (
    <button
      onClick={onPick}
      disabled={disabled && !selected}
      className={`w-full text-left rounded-lg border p-2.5 transition ${
        selected
          ? 'border-einride bg-einride/8'
          : disabled
          ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
          : 'border-gray-200 bg-white hover:border-einride/50 hover:bg-einride/5 shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-semibold ${selected ? 'text-einride' : 'text-gray-900'}`}>
          {route.label}
        </span>
        {selected && (
          <span className="text-[9px] uppercase tracking-widest bg-einride/15 text-einride border border-einride/30 rounded px-1.5 py-0.5 font-semibold">
            Locked
          </span>
        )}
      </div>
      <div className="text-[11px] text-gray-400 mb-2">{route.tagline}</div>
      <div className="grid grid-cols-2 gap-1">
        <Cell icon={<Clock size={10} />} label="ETA" value={`${route.etaMin} min`} />
        <Cell icon={<Truck size={10} />} label="Stopp" value={route.shipperIds.length} />
        <Cell icon={<Leaf size={10} />} label="Hållb." value={`${route.sustainScore}/100`} />
        <Cell icon={<Coins size={10} />} label="Intäkt" value={`${route.revenueSek.toLocaleString('sv-SE')} kr`} />
      </div>
    </button>
  );
}

function Cell({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded px-1.5 py-1">
      <span className="flex items-center gap-1 text-gray-400 uppercase tracking-widest text-[9px]">
        {icon}{label}
      </span>
      <span className="text-gray-700 font-medium text-[11px]">{value}</span>
    </div>
  );
}

function ChatInput({ phase, onSubmit }) {
  const [value, setValue] = useState('');
  const disabled = phase !== 'awaiting_destination';

  const submit = e => {
    e.preventDefault();
    if (disabled || !value.trim()) return;
    onSubmit(value);
    setValue('');
  };

  return (
    <form onSubmit={submit} className="border-t border-gray-100 p-2.5 flex items-center gap-2 bg-white flex-shrink-0">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={
          disabled
            ? phase === 'route_selected' ? 'Rutt låst · tryck ↻ för ny plan' : 'Välj ett alternativ ovan…'
            : 'Ange destination…'
        }
        disabled={disabled}
        className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-einride/50 focus:bg-white disabled:opacity-50 transition"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="bg-einride text-black rounded-lg px-2.5 py-2 disabled:bg-gray-100 disabled:text-gray-400 hover:bg-einride/90 transition flex-shrink-0"
      >
        <Send size={13} />
      </button>
    </form>
  );
}
