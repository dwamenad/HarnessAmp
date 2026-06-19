const app = document.querySelector('#app');

import('./console/app-shell.js')
  .then(({ initializeApp }) => initializeApp())
  .catch((error) => {
    console.error(error);
    renderBootstrapError();
  });

function renderBootstrapError() {
  if (!app) return;
  app.innerHTML = `
    <main class="ha-route-state" aria-live="polite">
      <section class="ha-panel route-error-state">
        <span class="ha-badge ha-badge--critical">Unavailable</span>
        <h1>Unable to load HarnessAmp</h1>
        <p>Refresh the page. If this keeps happening, check the local dev server.</p>
        <a class="ha-primary" href="/dashboard">Open dashboard</a>
      </section>
    </main>
  `;
}
