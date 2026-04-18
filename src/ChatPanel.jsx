import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Send,
  Bot,
  User,
  ChevronRight,
  ChevronLeft,
  Leaf,
  Clock,
  Truck,
  Coins,
  RotateCcw
} from 'lucide-react';

const PANEL_WIDTH = 380;

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
        className="absolute top-1/2 right-0 -translate-y-1/2 z-20 bg-black/80 backdrop-blur-md border border-white/10 border-r-0 rounded-l-xl px-2 py-4 hover:bg-einride/10 transition group"
      >
        <div className="flex flex-col items-center gap-2 text-white/70 group-hover:text-einride">
          <ChevronLeft size={16} />
          <MessageSquare size={18} />
          <span className="text-[10px] uppercase tracking-widest [writing-mode:vertical-rl] rotate-180">
            Chat
          </span>
        </div>
      </button>
    );
  }

  return (
    <motion.aside
      initial={{ x: PANEL_WIDTH }}
      animate={{ x: 0 }}
      exit={{ x: PANEL_WIDTH }}
      transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      style={{ width: PANEL_WIDTH }}
      className="absolute top-0 right-0 h-full z-20 bg-black/85 backdrop-blur-md border-l border-white/10 flex flex-col shadow-[-20px_0_60px_rgba(0,0,0,0.6)]"
    >
      <header className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-einride/15 border border-einride/30 flex items-center justify-center">
          <Bot size={18} className="text-einride" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.3em] text-einride">
            Route planner
          </div>
          <div className="text-sm font-semibold">Backhaul Assistant</div>
        </div>
        {phase === 'route_selected' && (
          <button
            onClick={onReset}
            title="Plan another route"
            className="p-1.5 rounded-md hover:bg-white/10 text-white/60 hover:text-white transition"
          >
            <RotateCcw size={15} />
          </button>
        )}
        <button
          onClick={onToggleCollapse}
          aria-label="Collapse chat"
          className="p-1.5 rounded-md hover:bg-white/10 text-white/60 hover:text-white transition"
        >
          <ChevronRight size={16} />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
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

      <ChatInput phase={phase} onSubmit={onSubmitDestination} />
    </motion.aside>
  );
}

function MessageBubble({ msg, suggestions, selectedRouteId, onQuickReply, onPickRoute, phase }) {
  const isUser = msg.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-einride/15 border border-einride/30 flex items-center justify-center shrink-0 mt-0.5">
          <Bot size={13} className="text-einride" />
        </div>
      )}
      <div className={`max-w-[85%] space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed border ${
            isUser
              ? 'bg-einride/15 border-einride/30 text-einride'
              : 'bg-white/[0.04] border-white/10 text-white/90'
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
                className="text-xs px-2.5 py-1 rounded-full border border-einride/40 text-einride hover:bg-einride/10 transition"
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {msg.suggestionIds && (
          <div className="w-full space-y-2 pt-1">
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
        <div className="w-7 h-7 rounded-full bg-einride/15 border border-einride/30 flex items-center justify-center shrink-0 mt-0.5">
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
      className={`w-full text-left rounded-lg border p-3 transition ${
        selected
          ? 'border-einride bg-einride/10'
          : disabled
          ? 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed'
          : 'border-white/10 bg-white/[0.03] hover:border-einride/50 hover:bg-einride/5'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className={`text-sm font-semibold ${selected ? 'text-einride' : ''}`}>
          {route.label}
        </div>
        {selected && (
          <span className="text-[10px] uppercase tracking-widest bg-einride/20 text-einride border border-einride/40 rounded px-1.5 py-0.5">
            Locked
          </span>
        )}
      </div>
      <div className="text-[11px] text-white/50 mb-2.5">{route.tagline}</div>
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
    <div className="flex items-center justify-between gap-2 bg-black/40 border border-white/5 rounded px-2 py-1">
      <span className="flex items-center gap-1 text-white/40 uppercase tracking-widest text-[9px]">
        {icon}
        {label}
      </span>
      <span className="text-white/90 font-medium">{value}</span>
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
      className="border-t border-white/10 p-3 flex items-center gap-2 bg-black/40"
    >
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
        className="flex-1 bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-einride/60 disabled:opacity-50 transition"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send"
        className="bg-einride text-black rounded-lg px-3 py-2 font-semibold disabled:bg-white/10 disabled:text-white/30 hover:bg-einride/90 transition"
      >
        <Send size={15} />
      </button>
    </form>
  );
}
