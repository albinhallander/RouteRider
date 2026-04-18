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
  it('walks origin → destination → backhaul confirm → pick route', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Greeting now asks for origin first.
    expect(
      screen.getByText(/Where are you coming from/i)
    ).toBeInTheDocument();

    // Pick origin (Göteborg).
    await user.click(screen.getByRole('button', { name: 'Göteborg' }));

    // Assistant now asks for destination.
    expect(
      await screen.findByText(/where are you headed/i)
    ).toBeInTheDocument();

    // Pick destination (Stockholm).
    await user.click(await screen.findByRole('button', { name: 'Stockholm' }));

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

    await user.click(await screen.findByRole('button', { name: 'Göteborg' }));
    await user.click(await screen.findByRole('button', { name: 'Stockholm' }));
    await user.click(await screen.findByRole('button', { name: 'Yes' }));
    await user.click(await screen.findByText(/Route B · Balanced backhaul/));

    // Confirm outreach walkthrough.
    await user.click(await screen.findByRole('button', { name: 'Yes' }));

    // First draft shown with Send / Skip / Edit controls. Backhaul order for
    // Göteborg → Stockholm puts Scania first (top score, closest to Stockholm
    // on the return leg), then AstraZeneca, then Husqvarna.
    expect(await screen.findByText(/First up: Scania Logistics/)).toBeInTheDocument();
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
      await screen.findByText(/Updated draft for Scania Logistics/)
    ).toBeInTheDocument();

    // Send the updated draft — walkthrough advances to the next shipper.
    const sendButtons = await screen.findAllByRole('button', { name: 'Send' });
    await user.click(sendButtons[sendButtons.length - 1]);
    expect(
      await screen.findByText(/Sent to Scania Logistics/)
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Next: AstraZeneca/)
    ).toBeInTheDocument();
  });
});
