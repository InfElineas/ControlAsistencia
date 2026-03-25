# Checklist de hardening móvil para APK

## 1) Build web
- [x] Ejecutar `npm run build`.
- [x] Verificar que se genere `dist/`.

## 2) Variables de entorno frontend
- [x] Mantener solo variables públicas con prefijo `VITE_` en frontend.
- [x] Configurar `VITE_PUBLIC_APP_URL` para web.
- [x] Configurar `VITE_MOBILE_AUTH_REDIRECT_URL` para callback móvil.

## 3) Redirect de autenticación
- [x] Revisar estrategia de redirect para web y móvil.
- [x] Evitar depender de `origin` de WebView en móvil.

## 4) Geolocalización
- [x] Mantener fallback web (`navigator.geolocation`).
- [x] Añadir compatibilidad con bridge nativo de Capacitor cuando esté disponible.

## 5) Routing
- [x] Web: `BrowserRouter`.
- [x] Móvil nativo: `HashRouter` para evitar problemas de rutas en WebView.

## 6) Capacitor base
- [x] Crear `capacitor.config.json` con `webDir: dist`.
- [x] Añadir scripts para build/sync/open de Android.
