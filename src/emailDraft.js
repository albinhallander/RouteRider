// Suggests a pickup time for the Nth shipper along the route
// (14:00 + 30 min per shipper index).
export function suggestedPickupTime(idx) {
  const minutesFrom14 = idx * 30;
  const hour = 14 + Math.floor(minutesFrom14 / 60);
  const minute = minutesFrom14 % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function draftPickupEmail(shipper, activeRoute, pickupTime) {
  const today = new Date().toLocaleDateString('sv-SE');
  const originLabel = activeRoute.originLabel ?? 'Gothenburg';
  const destinationLabel = activeRoute.destinationLabel ?? 'Stockholm';
  const directionLine = (activeRoute.direction ?? `Heading to ${destinationLabel}`).toLowerCase();
  const pallets = activeRoute.palletCapacity ?? 22;
  const weightKg = activeRoute.maxWeightKg ?? 24000;
  const tonLabel = `${(weightKg / 1000).toFixed(weightKg % 1000 === 0 ? 0 : 1)} ton`;

  const signals = shipper.signals ?? [];
  const tedSig = signals.find(s => s.type === 'ted');
  const lbSig  = signals.find(s => s.type === 'load_board');
  const cdpSig = signals.find(s => s.type === 'cdp');

  let signalHook = '';
  if (tedSig) {
    const valueMsek = tedSig.valueSek ? ` (${(tedSig.valueSek / 1_000_000).toFixed(1)} MSEK)` : '';
    signalHook = `\nWe noticed your logistics framework contract${valueMsek} is coming up for renewal in ${tedSig.expiry} — we'd love to be your green transport partner going forward.`;
  } else if (lbSig) {
    signalHook = `\nWe see you have an active freight posting on the corridor (${lbSig.detail}) — our truck passes ${shipper.location.split(',')[0].trim()} at ${pickupTime} and can take that load today.`;
  } else if (cdpSig?.pressure === 'high') {
    signalHook = `\nYour sector faces increasing Scope 3 transport scrutiny — our zero-emission 40-ton truck delivers verified carbon data with every shipment, ready for your sustainability report.`;
  }
  return `Subject: Backhaul capacity ${originLabel} → ${destinationLabel} · ${today}

Hi ${shipper.company} team,

We're operating a zero-emission 40-ton electric truck (${activeRoute.truckId}) currently ${directionLine}. Based on your location in ${shipper.location} (${shipper.distanceFromE4} km off corridor), we can offer a same-day backhaul slot at ~35% below standard freight.${signalHook}

  Capacity:  up to ${pallets} EUR pallet${pallets === 1 ? '' : 's'} / ${tonLabel}
  Pickup:    today, ${pickupTime}
  CO₂:       0 g tailpipe — sustainability uplift score ${shipper.score}/100
  Cargo fit: ${shipper.cargo}

Reply YES to lock this slot — our ops team will confirm within 5 minutes.

— RouteRider · Einride Backhaul`;
}

// Booking-confirmation email sent once a route is locked — only to the
// shippers that actually made it onto the truck. Echoes the cargo the
// shipper quoted (pallets + total kg) and the pickup slot.
export function draftConfirmationEmail(shipper, activeRoute, pickupTime) {
  const today = new Date().toLocaleDateString('sv-SE');
  const originLabel = activeRoute.originLabel ?? 'Gothenburg';
  const destinationLabel = activeRoute.destinationLabel ?? 'Stockholm';
  const pallets = shipper.pallets;
  const weightKg = shipper.weightKg;
  const cargoLine =
    pallets != null && weightKg != null
      ? `  Cargo:     ${pallets} EUR pallet${pallets === 1 ? '' : 's'} · ${weightKg.toLocaleString('sv-SE')} kg`
      : '';

  return `Subject: Pickup confirmed · ${originLabel} → ${destinationLabel} · ${today}

Hi ${shipper.company} team,

Confirming your backhaul pickup for today. Our electric truck ${activeRoute.truckId} is on the way.

  Pickup:    today, ${pickupTime}
  Location:  ${shipper.location}
${cargoLine}
  Corridor:  ${originLabel} → ${destinationLabel}

Driver will check in 15 minutes before arrival. Any last-minute changes — reply to this thread.

— RouteRider · Einride Backhaul`;
}

// Mock edit-rewriter. If the user's note mentions a time (HH:MM) + pickup-ish
// keyword, swap the Pickup line. Otherwise append the note at the bottom.
export function applyUserNote(draft, note) {
  const trimmed = note.trim();
  if (!trimmed) return draft;

  const timeMatch = trimmed.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const lower = trimmed.toLowerCase();
  const mentionsPickup =
    lower.includes('pickup') ||
    lower.includes('time') ||
    lower.includes('hämtning') ||
    lower.includes('tid') ||
    lower.includes('kl');

  if (timeMatch && mentionsPickup) {
    return draft.replace(/^\s*Pickup:.*$/m, `  Pickup:    today, ${timeMatch[0]}`);
  }
  return `${draft}\n\n(Note from dispatcher: ${trimmed})`;
}
