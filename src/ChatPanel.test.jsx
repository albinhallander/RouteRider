import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

    // Chat continues by asking about supplier outreach.
    expect(
      await screen.findByText(/Should I contact the suppliers/i)
    ).toBeInTheDocument();
  });

  it('walks the per-shipper outreach draft loop', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Stockholm' }));
    await user.click(await screen.findByRole('button', { name: 'Yes' }));
    await user.click(await screen.findByText(/Route B · Balanced backhaul/));

    // Confirm outreach walkthrough.
    await user.click(await screen.findByRole('button', { name: 'Yes' }));

    // First draft shown with Send / Skip / Edit controls.
    expect(await screen.findByText(/First up: Husqvarna AB/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Send' }).length).toBeGreaterThan(0);

    // Start editing the first draft.
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(
      await screen.findByText(/What would you like to change/)
    ).toBeInTheDocument();

    // Submit an edit — time change routes through the mock rewriter.
    const input = screen.getByPlaceholderText(/Beskriv ändring/i);
    await user.type(input, 'Change pickup to 16:00');
    await user.keyboard('{Enter}');
    expect(
      await screen.findByText(/Updated draft for Husqvarna AB/)
    ).toBeInTheDocument();

    // Send the updated draft — walkthrough advances to the next shipper.
    const sendButtons = await screen.findAllByRole('button', { name: 'Send' });
    await user.click(sendButtons[sendButtons.length - 1]);
    expect(
      await screen.findByText(/Sent to Husqvarna AB/)
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Next: Toyota Material Handling/)
    ).toBeInTheDocument();
  });
});
