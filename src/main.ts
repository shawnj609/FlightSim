import './style.css';
import { SimulatorApp } from './app/SimulatorApp';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Missing #app root');
}

root.replaceChildren();
new SimulatorApp(root).start();
