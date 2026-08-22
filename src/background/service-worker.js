import { bootstrapLifecycle } from './lifecycle.js';

bootstrapLifecycle().catch((error)=>{
  console.error('[Nolane Sentinel] Không thể khởi tạo service worker:',error);
});
