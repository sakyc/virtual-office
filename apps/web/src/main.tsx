import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// Placeholder only. Existing Three.js office remains the production frontend until migrated deliberately.
createRoot(document.getElementById('root')!).render(<StrictMode><main aria-label="Virtual Office application" /></StrictMode>);
