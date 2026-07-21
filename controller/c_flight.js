const axios = require('axios');

// Major South Korean airport IATA codes - AviationStack's flight endpoint doesn't
// return a departure country, so "Korea only" is filtered by known origin airports.
const KOREA_AIRPORT_IATA = new Set([
  'ICN', // Incheon
  'GMP', // Gimpo (Seoul)
  'PUS', // Busan (Gimhae)
  'CJU', // Jeju
  'TAE', // Daegu
  'CJJ', // Cheongju
  'KWJ', // Gwangju
  'USN', // Ulsan
  'RSU', // Yeosu
  'KPO', // Pohang
  'HIN', // Sacheon
  'MWX', // Muan
  'WJU', // Wonju
  'YNY'  // Yangyang
]);

// Derives a front-desk-friendly status instead of trusting the airline's raw
// flight_status alone - AviationStack's free-tier data can say "landed" while
// its own arrival time is still in the future, so "Landed" is decided purely
// by comparing the arrival time to right now, not by the raw status flag.
// "Delayed" is flagged when it's running meaningfully late.
function computeDisplayStatus(rawStatus, arrival) {
  const status = (rawStatus || '').toLowerCase();
  arrival = arrival || {};

  if (status === 'cancelled' || status === 'incident' || status === 'diverted') {
    return (rawStatus || 'UNKNOWN').toUpperCase();
  }

  const bestTime = arrival.actual || arrival.estimated || arrival.scheduled;
  if (bestTime && new Date(bestTime).getTime() <= Date.now()) {
    return 'LANDED';
  }

  const lateByMinutes = arrival.delay
    || (arrival.estimated && arrival.scheduled
      ? (new Date(arrival.estimated).getTime() - new Date(arrival.scheduled).getTime()) / 60000
      : 0);
  if (lateByMinutes > 15) {
    return 'DELAYED';
  }

  // Not landed by time and not delayed - fall back to the raw status, EXCEPT
  // "landed" itself, which we've already decided not to trust at face value
  // (that's the whole point of this function): treat it as still en route.
  if (status === 'landed' || status === 'active') {
    return 'ARRIVAL';
  }
  return (rawStatus || 'SCHEDULED').toUpperCase();
}

// Flight status lookup for PUAP (airport pick-up/drop-off) - lets front desk see
// the actual arrival status of a guest's incoming flight (e.g. into Clark/CRK).
// Uses AviationStack (https://aviationstack.com) since there is no direct/free
// feed from Clark International Airport itself; AviationStack covers CRK like
// any other airport worldwide via the flight number.
class FlightController {
  static async getFlightStatus(req, res) {
    try {
      res.set('Cache-Control', 'no-store'); // flight status changes constantly - never serve a stale cached copy
      const { flightNumber } = req.params;
      const apiKey = process.env.AVIATIONSTACK_API_KEY;

      if (!flightNumber || !flightNumber.trim()) {
        return res.status(400).json({ success: false, message: 'Flight number is required' });
      }

      if (!apiKey) {
        return res.status(500).json({
          success: false,
          message: 'Flight status lookup is not configured. Set AVIATIONSTACK_API_KEY in your environment variables.'
        });
      }

      const response = await axios.get('http://api.aviationstack.com/v1/flights', {
        params: {
          access_key: apiKey,
          flight_iata: flightNumber.trim().toUpperCase()
        },
        timeout: 10000
      });

      if (response.data?.error) {
        return res.status(502).json({
          success: false,
          message: response.data.error.message || 'Flight status provider returned an error'
        });
      }

      const flights = response.data?.data || [];
      if (flights.length === 0) {
        return res.status(404).json({ success: false, message: `No flight found for "${flightNumber}"` });
      }

      // Prefer the most recent/relevant entry (today's flight if there are several historical rows)
      const flight = flights[0];

      return res.status(200).json({
        success: true,
        data: {
          flightNumber: flight.flight?.iata || flightNumber.trim().toUpperCase(),
          airline: flight.airline?.name || null,
          status: computeDisplayStatus(flight.flight_status, flight.arrival),
          date: flight.flight_date || null,
          departure: {
            airport: flight.departure?.airport || null,
            iata: flight.departure?.iata || null,
            scheduled: flight.departure?.scheduled || null,
            estimated: flight.departure?.estimated || null,
            actual: flight.departure?.actual || null
          },
          arrival: {
            airport: flight.arrival?.airport || null,
            iata: flight.arrival?.iata || null,
            scheduled: flight.arrival?.scheduled || null,
            estimated: flight.arrival?.estimated || null,
            actual: flight.arrival?.actual || null,
            delayMinutes: flight.arrival?.delay ?? null
          }
        }
      });
    } catch (error) {
      console.error('Error fetching flight status:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch flight status', error: error.message });
    }
  }

  // List upcoming arrivals into Clark (CRK) so front desk can pick a guest's
  // flight off a list instead of typing the exact flight number.
  // Note: the AviationStack free plan does not support filtering by flight_date,
  // so we fetch a batch of CRK arrivals and filter/sort to "upcoming" ourselves.
  static async getArrivals(req, res) {
    try {
      res.set('Cache-Control', 'no-store'); // flight status changes constantly - never serve a stale cached copy
      const apiKey = process.env.AVIATIONSTACK_API_KEY;

      if (!apiKey) {
        return res.status(500).json({
          success: false,
          message: 'Flight status lookup is not configured. Set AVIATIONSTACK_API_KEY in your environment variables.'
        });
      }

      const { origin } = req.query; // optional: 'KR' to show only flights departing South Korea

      const response = await axios.get('http://api.aviationstack.com/v1/flights', {
        params: {
          access_key: apiKey,
          arr_iata: 'CRK',
          limit: 100
        },
        timeout: 10000
      });

      if (response.data?.error) {
        return res.status(502).json({
          success: false,
          message: response.data.error.message || 'Flight status provider returned an error'
        });
      }

      const flights = response.data?.data || [];
      const now = Date.now();
      const cutoff = now - (2 * 60 * 60 * 1000); // keep flights up to 2 hours in the past (recently landed)

      let arrivals = flights
        .map(f => ({
          flightNumber: f.flight?.iata || null,
          airline: f.airline?.name || null,
          status: computeDisplayStatus(f.flight_status, f.arrival),
          originAirport: f.departure?.airport || null,
          originIata: f.departure?.iata || null,
          scheduled: f.arrival?.scheduled || null,
          estimated: f.arrival?.estimated || null,
          actual: f.arrival?.actual || null,
          delayMinutes: f.arrival?.delay ?? null
        }))
        .filter(f => f.flightNumber && f.scheduled && new Date(f.scheduled).getTime() >= cutoff);

      if (origin && origin.toUpperCase() === 'KR') {
        arrivals = arrivals.filter(f => KOREA_AIRPORT_IATA.has(f.originIata));
      }

      arrivals = arrivals
        .sort((a, b) => new Date(a.scheduled).getTime() - new Date(b.scheduled).getTime())
        .slice(0, 50);

      return res.status(200).json({ success: true, data: arrivals });
    } catch (error) {
      console.error('Error fetching flight arrivals:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch flight arrivals', error: error.message });
    }
  }
}

module.exports = FlightController;
