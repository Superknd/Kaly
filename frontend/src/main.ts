import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => document.getElementById('app-loading')?.remove())
  .catch((err) => {
    console.error(err);
    const loading = document.getElementById('app-loading');
    loading?.classList.add('app-loading-error');
    const message = loading?.querySelector('[data-loading-message]');
    if (message) {
      message.textContent = 'Kaly n’a pas pu démarrer. Rechargez la page.';
    }
  });
