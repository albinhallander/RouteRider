import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Send,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  Leaf,
  Clock,
  Truck,
  Coins,
  RotateCcw
} from 'lucide-react';

const PANEL_HEIGHT = 460;

export default function ChatPanel({
  phase,
  messages,
  suggestions,
  selectedRouteId,
  onSubmitDestination,
  onConfirmBackhaul,
  onPickRoute,
  onReset,
  collapsed,
  onToggleCollapse
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, suggestions]);

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        aria-label="Open chat"
        className="absolute bottom-0 left-0 right-0 z-[1000] bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] hover:bg-einride/5 transition group flex items-center justify-center gap-2 py-3 text-sm font-semibold text-gray-700 group-hover:text-einride"
      >
        <MessageSquare size={16} className="text-einride" />
        <span>Route planner</span>
        <ChevronUp size={16} className="text-gray-400 group-hover:text-einride" />
      </button>
    );
  }

  return (
    <motion.aside
      initial={{ y: PANEL_HEIGHT }}
      animate={{ y: 0 }}
      exit={{ y: PANEL_HEIGHT }}
      transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      style={{ height: PANEL_HEIGHT }}
      className="absolute bottom-0 left-0 right-0 z-[1000] bg-white border-t border-gray-200 flex flex-col shadow-[0_-10px_30px_rgba(0,0,0,0.08)]"
    >
      <header className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-lg bg-einride/10 border border-einride/20 flex items-center justify-center">
          <Bot size={18} className="text-einride" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.3em] text-einride font-semibold">
            Route planner
          </div>
          <div className="text-sm font-semibold text-gray-900">Backhaul Assistant</div>
        </div>
        {phase === 'route_selected' && (
          <button
            onClick={onReset}
            title="Plan another route"
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition"
          >
            <RotateCcw size={15} />
          </button>
        )}
        <button
          onClick={onToggleCollapse}
          aria-label="Collapse chat"
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition"
        >
          <ChevronDown size={16} />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        <div className="max-w-3xl mx-auto w-full space-y-3">
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
      </div>

      <ChatInput phase={phase} onSubmit={onSubmitDestination} />
    </motion.aside>
  );
}

function MessageBubble({ msg, suggestions, selectedRouteId, onQuickReply, onPickRoute, phase }) {
  const isUser = msg.role === 'user';
  const hasSuggestions = !!msg.suggestionIds;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-einride/10 border border-einride/20 flex items-center justify-center shrink-0 mt-0.5">
          <Bot size={13} className="text-einride" />
        </div>
      )}
      <div
        className={`space-y-2 flex flex-col ${
          hasSuggestions ? 'flex-1 max-w-full' : 'max-w-[80%]'
        } ${isUser ? 'items-end' : 'items-start'}`}
      >
        <div
          className={`rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed border ${
            isUser
              ? 'bg-einride/10 border-einride/30 text-einride font-medium'
              : 'bg-white border-gray-200 text-gray-800 shadow-sm'
          }`}
        >
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
          <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
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
        <div className="w-7 h-7 rounded-full bg-einride/10 border border-einride/20 flex items-center justify-center shrink-0 mt-0.5">
          <User size={13} className="text-einride" />
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
      className={`w-full text-left rounded-lg border p-3 transition h-full ${
        selected
          ? 'border-einride bg-einride/10'
          : disabled
          ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
          : 'border-gray-200 bg-white hover:border-einride/50 hover:bg-einride/5 shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className={`text-sm font-semibold ${selected ? 'text-einride' : 'text-gray-900'}`}>
          {route.label}
        </div>
        {selected && (
          <span className="text-[10px] uppercase tracking-widest bg-einride/15 text-einride border border-einride/30 rounded px-1.5 py-0.5 font-semibold">
            Locked
          </span>
        )}
      </div>
      <div className="text-[11px] text-gray-500 mb-2.5 min-h-[28px]">{route.tagline}</div>
      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        <Cell icon={<Clock size={11} />} label="ETA" value={`${route.etaMin} min`} />
        <Cell icon={<Truck size={11} />} label="Pickups" value={route.shipperIds.length} />
        <Cell icon={<Leaf size={11} />} label="Sustain" value={`${route.sustainScore}/100`} />
        <Cell icon={<Coins size={11} />} label="Revenue" value={`${route.revenueSek.toLocaleString('sv-SE')} kr`} />
      </div>
    </button>
  );
}

function Cell({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-100 rounded px-2 py-1">
      <span className="flex items-center gap-1 text-gray-400 uppercase tracking-widest text-[9px]">
        {icon}
        {label}
      </span>
      <span className="text-gray-800 font-medium">{value}</span>
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
    <form
      onSubmit={submit}
      className="border-t border-gray-100 p-3 flex items-center gap-2 bg-white flex-shrink-0"
    >
      <div className="max-w-3xl w-full mx-auto flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={
            disabled
              ? phase === 'route_selected'
                ? 'Route locked · use ↻ to plan again'
                : 'Pick an option above…'
              : 'Type a destination…'
          }
          disabled={disabled}
          aria-label="Destination"
          className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-einride/50 focus:bg-white disabled:opacity-60 transition"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="Send"
          className="bg-einride text-black rounded-lg px-3 py-2 font-semibold disabled:bg-gray-100 disabled:text-gray-400 hover:bg-einride/90 transition"
        >
          <Send size={15} />
        </button>
      </div>
    </form>
  );
}
