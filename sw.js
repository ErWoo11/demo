const CACHE_NAME = 'control-horario-v1';

// sw.js - Versión: 2026.02.14 (¡ACTUALIZA ESTA FECHA EN CADA DEPLOY!)
const CACHE_VERSION = 'v2026.02.15'; // ⚠️ CAMBIA ESTA FECHA EN CADA ACTUALIZACIÓN
const CACHE_NAME = `control-horario-${CACHE_VERSION}`;

// Archivos esenciales para precachear
const CORE_FILES = [
  '/',
  'index.html',
  'admin.html',
  'admin.css',
  'admin.js',
  'registro.html',
  'vehiculo.html',
  'mis_registros.html',
  'contratos.html',
  'nomina.html',
  'notificaciones.html',
  'gastos.html',
  'logo.png',
  'logo-512.png',
  'logo-admin.png',
  'logo-admin-512.png',
  'fondo.png',
  'fondo-ondas.png',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js',
  'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
    console.log(`[SW] Instalando nueva versión: ${CACHE_VERSION}`);
    self.skipWaiting(); // Activar inmediatamente sin esperar
    
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // Solo cachear archivos esenciales para inicio rápido
            return cache.addAll(CORE_FILES).catch(err => {
                console.warn('[SW] Error precacheando archivos:', err);
            });
        })
    );
});

self.addEventListener('activate', (event) => {
    console.log(`[SW] Activando nueva versión: ${CACHE_VERSION}`);
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Eliminar cachés antiguos
                    if (cacheName !== CACHE_NAME && cacheName.startsWith('control-horario-')) {
                        console.log(`[SW] Eliminando caché antiguo: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => self.clients.claim()) // Tomar control inmediato de todas las páginas
    );
    
    // Notificar a todas las páginas abiertas que hay una actualización
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'UPDATE_AVAILABLE',
                version: CACHE_VERSION
            });
        });
    });
});

self.addEventListener('fetch', (event) => {
    // Para HTML siempre ir a red (nunca cachear)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                // Si falla la red, intentar caché como fallback
                return caches.match(event.request).then(response => {
                    return response || new Response(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width">
                            <title>Sin conexión</title>
                            <style>
                                body { 
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                    text-align: center; 
                                    padding: 40px 20px; 
                                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                    color: white;
                                    min-height: 100vh;
                                    display: flex;
                                    flex-direction: column;
                                    justify-content: center;
                                    align-items: center;
                                }
                                .container {
                                    background: rgba(255,255,255,0.95);
                                    color: #333;
                                    border-radius: 20px;
                                    padding: 30px;
                                    max-width: 500px;
                                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                                }
                                h1 { 
                                    color: #d32f2f; 
                                    font-size: 2.5rem; 
                                    margin-bottom: 20px;
                                }
                                p { 
                                    font-size: 1.2rem; 
                                    margin: 15px 0;
                                    line-height: 1.5;
                                }
                                .icon { 
                                    font-size: 4rem; 
                                    margin-bottom: 20px;
                                }
                                .btn {
                                    background: linear-gradient(135deg, #667eea, #764ba2);
                                    color: white;
                                    border: none;
                                    padding: 12px 30px;
                                    border-radius: 50px;
                                    font-size: 1.1rem;
                                    font-weight: bold;
                                    margin-top: 20px;
                                    cursor: pointer;
                                    transition: transform 0.2s;
                                }
                                .btn:hover {
                                    transform: scale(1.05);
                                }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="icon">⚠️</div>
                                <h1>Sin conexión a internet</h1>
                                <p>Esta aplicación requiere conexión para funcionar.</p>
                                <p>Por favor, verifica tu conexión y recarga la página.</p>
                                <button class="btn" onclick="location.reload()">Recargar</button>
                            </div>
                        </body>
                        </html>
                    `, { headers: { 'Content-Type': 'text/html' } });
                });
            })
        );
        return;
    }
    
    // Para otros recursos (CSS, JS, imágenes): Estrategia Network First
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Actualizar caché con la nueva versión
                const url = new URL(event.request.url);
                if (response.status === 200 && 
                    (url.pathname.startsWith('/') || url.hostname === self.location.hostname)) {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, response.clone());
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback al caché si la red falla
                return caches.match(event.request).then(response => {
                    return response || fetch(event.request); // Reintentar una vez
                });
            })
    );
});