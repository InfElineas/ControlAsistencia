# Remediación GPS en APK (WebView + Capacitor)

Este documento deja el flujo concreto para evitar falsos positivos de **"GPS apagado"** cuando el problema real es permiso denegado o flujo incompleto de WebView.

## 1) AndroidManifest.xml (obligatorio)

En `android/app/src/main/AndroidManifest.xml` agrega/verifica:

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

<!-- Opcional: solo si alguna vez pides ubicación en background -->
<!-- <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" /> -->

<uses-feature
    android:name="android.hardware.location.gps"
    android:required="false" />
```

> `required="false"` evita que Play Store filtre dispositivos sin chip GPS dedicado (pueden usar red/Wi‑Fi).

## 2) Permiso runtime en Android WebView

Si usas solo navegador web, no hay plugin nativo para permisos de Android y puede fallar el puente.
Con Capacitor, la solicitud debe pasar por el plugin de geolocalización (`requestPermissions`).

## 3) Flujo robusto recomendado

1. Verificar permisos (`checkPermissions`).
2. Si no está `granted`, solicitar (`requestPermissions`).
3. Si queda `denied`, mostrar mensaje de permiso (NO “GPS apagado”).
4. Con permiso concedido, pedir coordenadas (`getCurrentPosition`).
5. Si falla con “location disabled / provider off”, clasificar como GPS apagado.
6. Si falla por timeout, clasificar como señal/timeout.

## 4) Mensajes UX correctos

- `permission_denied`: “Permiso de ubicación denegado”.
- `gps_disabled`: “Activa GPS/Ubicación en Ajustes”.
- `timeout`: “No se obtuvo señal a tiempo”.
- `unknown`: “No se pudo obtener ubicación”.

## 5) Comandos de sync nativo

Tras cambios web y plugins en un proyecto con carpeta `android/`:

```bash
npm run mobile:build
npm run mobile:sync
npm run mobile:android
```

## 6) Nota sobre plugin nativo

La app debe exponer en runtime los plugins `Geolocation` y `App` en `window.Capacitor.Plugins`.
Sin eso, `navigator.geolocation` en WebView puede ser inconsistente y reportar errores ambiguos.
