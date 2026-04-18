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
  return `Subject: Backhaul capacity ${originLabel} → ${destinationLabel} · ${today}

Hi ${shipper.company} team,

We're operating a zero-emission 40-ton electric truck (${activeRoute.truckId}) currently ${directionLine}. Based on your location in ${shipper.location} (${shipper.distanceFromE4} km off corridor), we can offer a same-day backhaul slot at ~35% below standard freight.

  Capacity:  up to ${pallets} EUR pallet${pallets === 1 ? '' : 's'} / ${tonLabel}
  Pickup:    today, ${pickupTime}
  CO₂:       0 g tailpipe — sustainability uplift score ${shipper.score}/100
  Cargo fit: ${shipper.cargo}

Reply YES to lock this slot — our ops team will confirm within 5 minutes.

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
