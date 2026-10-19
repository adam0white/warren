import './ui/style.css';
import { _debug, start } from './ui/app.ts';

if (import.meta.env.DEV) (window as unknown as { __warren: typeof _debug }).__warren = _debug;
void start();
