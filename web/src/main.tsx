import { render } from '@solidjs/web';
import { App } from './app/App.tsx';
import './styles.css';

render(() => <App />, document.getElementById('app')!);
