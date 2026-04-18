import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-leaflet', () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return {
    MapContainer: Stub,
    TileLayer: () => null,
    Polyline: () => null,
    Marker: () => null,
    CircleMarker: () => null
  };
});

vi.mock('leaflet', () => ({
  default: { divIcon: () => ({}) }
}));

import App from './App.jsx';

describe('Chat-first route planner', () => {
  it('walks destination → backhaul confirm → pick route', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Greeting renders.
    expect(
      screen.getByText(/Where are you going today/i)
    ).toBeInTheDocument();

    // Pick the Stockholm quick-reply chip.
    await user.click(screen.getByRole('button', { name: 'Stockholm' }));

    // Assistant asks about backhaul.
    expect(
      await screen.findByText(/Want me to find backhaul shipments/i)
    ).toBeInTheDocument();

    // Baseline outreach count before route selection.
    const hudBefore = screen.getByText('Outreach').closest('div').parentElement;
    const countBefore = within(hudBefore).getByText(/\d+\/\d+/).textContent;

    // Confirm yes.
    await user.click(screen.getByRole('button', { name: 'Yes' }));

    // Three suggestion cards appear.
    expect(await screen.findByText(/Route A · Direct/)).toBeInTheDocument();
    expect(screen.getByText(/Route B · Balanced backhaul/)).toBeInTheDocument();
    expect(screen.getByText(/Route C · Max revenue/)).toBeInTheDocument();

    // Pick Route B.
    await user.click(screen.getByText(/Route B · Balanced backhaul/));

    // Confirmation bubble is shown.
    expect(
      await screen.findByText(/Locked in Route B · Balanced backhaul/)
    ).toBeInTheDocument();

    // Outreach logistics state is unchanged (filtering is a view concern only).
    const hudAfter = screen.getByText('Outreach').closest('div').parentElement;
    const countAfter = within(hudAfter).getByText(/\d+\/\d+/).textContent;
    expect(countAfter.startsWith(countBefore.split('/')[0] + '/')).toBe(true);
  });
});
