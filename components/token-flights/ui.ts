import { useSyncExternalStore } from 'react';
import { EMPTY_LEDGER, type FlightLedger, type Ledger } from './ledger.ts';

export * from './index.ts';
export { FLIGHT_MS, STAGGER_MS, TokenFlights, type TokenArt, type TokenFlightsProps } from './TokenFlights.tsx';

/** The table's ledger, followed as tokens take off and land. */
export const useFlightLedger = (ledger: FlightLedger): Ledger => useSyncExternalStore(ledger.subscribe, ledger.get, () => EMPTY_LEDGER);
