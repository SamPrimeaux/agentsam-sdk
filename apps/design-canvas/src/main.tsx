import { createRoot } from 'react-dom/client';
import { DesignCanvasApp } from './DesignCanvasApp';
const mount=document.getElementById('app');
if(!mount) throw new Error('Design Canvas mount missing');
createRoot(mount).render(<DesignCanvasApp/>);
