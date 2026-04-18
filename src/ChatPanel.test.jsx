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

// Stub OSRM so filterFeasibleShippers + planRouteFromYes resolve instantly
// in jsdom. Every per-shipper lookup returns a modest detour well under
// the 6 h cap so all shippers come through as feasible.
vi.mock('./mapboxRouting.js', () => ({
  fetchDrivingRoute: (waypoints) =>
    Promise.resolve({
      durationMin: Math.max(60, (waypoints.length - 1) * 60),
      distanceKm: 300,
      geometry: waypoints,
      source: 'test'
    })
}));

import App from './App.jsx';

describe('Chat-first backhaul planner', () => {
  it('walks origin → destination → feasibility list → send to all → plan route', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText(/Where are you coming from/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Göteborg' }));
    expect(await screen.findByText(/Where are you headed/i)).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Stockholm' }));

    // Pallet capacity question
    expect(await screen.findByText(/How many EUR pallets/i)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '33' }));

    // Max weight question
    expect(await screen.findByText(/maximum cargo weight/i)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '24000' }));

    // Feasibility message references eligible shippers and offers Send to all.
    expect(
      await screen.findByText(/eligible shipper/i, {}, { timeout: 5000 })
    ).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Send to all' }));
    expect(
      await screen.findByText(/Sent outreach to \d+ shipper/i)
    ).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Plan route' }));
    expect(
      await screen.findByText(/Locked in/i, {}, { timeout: 5000 })
    ).toBeInTheDocument();
  }, 15000);
});
