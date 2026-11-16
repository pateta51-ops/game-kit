// The offline e2e's page script: registers the worker through register.ts and shows the update state on <body>.
import { applyUpdate, registerServiceWorker, useUpdate } from '../register.ts';

const show = (): void => {
  document.body.dataset['update'] = useUpdate.getState().state;
};
useUpdate.subscribe(show);
show();
registerServiceWorker({ prod: true, e2e: false, local: true }, 'sw.js');
(window as unknown as { applyUpdate: () => void }).applyUpdate = () => {
  applyUpdate();
};
