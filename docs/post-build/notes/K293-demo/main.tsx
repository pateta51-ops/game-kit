import { createRoot } from 'react-dom/client';
import { TurnBanner } from '../../../../components/table-panels/ui.tsx';
createRoot(document.getElementById('root')!).render(<div style={{ font: '28px sans-serif', padding: 24 }}><TurnBanner phases={[{ id: 'u1', name: 'Upkeep' }]} turn={3} seat="a" phase="u1" seatName={() => 'Ashen Court'} turnName={(t) => `Round ${t} of the siege`} /></div>);
