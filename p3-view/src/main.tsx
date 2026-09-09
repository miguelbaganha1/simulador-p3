import { createRoot } from 'react-dom/client';
import { P3System } from 'p3-system';
import { App } from './App.tsx';

const system = new P3System();
const root = createRoot(document.getElementById('root')!);
root.render(<App system={system} />);
