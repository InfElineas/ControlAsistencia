# Remediación GPS + permisos foreground/background (APK Capacitor)

## Archivos clave corregidos

- `src/lib/location-service.ts`: capa reusable de permisos/posición/background.
- `src/hooks/useGeolocation.ts`: flujo robusto y estados explícitos.
- `src/pages/Attendance.tsx`: integra base de tracking para salida automática por abandono de geocerca.
- `src/pages/employee/EmployeeMarkPage.tsx`: mensajes y acciones correctivas diferenciadas.
- `src/pages/GpsDiagnostics.tsx`: diagnóstico correcto de permiso bloqueado vs GPS apagado.
- `android/app/src/main/AndroidManifest.xml`: manifiesto con permisos modernos para Android.

## Estados de error estandarizados

- `permission_denied`
- `permission_blocked`
- `gps_disabled`
- `location_unavailable`
- `timeout`
- `outside_geofence`
- `background_not_granted`
- `background_tracking_unavailable`
- `unknown_error`

## Flujo final implementado

1. `checkLocationPermissions()`
2. Si foreground no está concedido: `requestForegroundLocationPermission()`
3. Si queda denegado/bloqueado: UI específica + botón a settings.
4. Solo con foreground OK: `getCurrentDevicePosition()`
5. Para auto-salida geofence: `requestBackgroundLocationPermission()`
6. Si background no está concedido: `background_not_granted`.
7. Si arquitectura no soporta tracking real en background: `background_tracking_unavailable`.

## Limitación honesta de background tracking

La base quedó lista para usar plugin/servicio nativo real (`BackgroundGeolocation` o servicio foreground Android).
Si ese componente nativo no está presente, la app usa fallback `watchPosition` y reporta
`background_tracking_unavailable` en vez de simular que funciona en segundo plano.

## AndroidManifest recomendado

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-feature android:name="android.hardware.location.gps" android:required="false" />
```

## Pasos exactos de build/sync APK

```bash
npm install
npm run build
npx cap sync android
npx cap open android
```

> Después de abrir Android Studio, generar APK/AAB desde **Build > Build Bundle(s) / APK(s)**.
