import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, type AppServices } from './App';
import './styles.css';

async function renderApp() {
  let services: AppServices | undefined;
  if (import.meta.env.MODE === 'e2e') {
    const { createE2EServices } = await import('./testing/e2eServices');
    services = createE2EServices();
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App services={services} />
    </StrictMode>,
  );
}

void renderApp();
