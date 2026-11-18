import { createRoot } from 'react-dom/client';
import { Board } from './Board.tsx';

const root = document.getElementById('root');
if (root) createRoot(root).render(<Board />);
