// Service worker mínimo para que SOL sea instalable.
// No guarda nada en caché: ventas, inventario y pedidos siempre requieren conexión a internet.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
