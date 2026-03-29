# APK no se instala / no aparece en Android (diagnóstico rápido)

Si la APK no abre o ni siquiera aparece instalada, revisa en este orden:

## 1) Recompila y sincroniza correctamente

```bash
npm install
npm run build
npx cap sync android
npx cap open android
```

En Android Studio genera una APK **debug** primero.

## 2) Desinstala versiones previas con firma distinta

Si instalaste antes una APK firmada con otra key, Android bloquea instalación silenciosamente.
Desinstala primero la app anterior y vuelve a instalar.

## 3) Verifica versión Android mínima

Si `minSdkVersion` de la app es mayor que la de tu teléfono, no se instalará.
Revisa `android/app/build.gradle` (en proyecto Android completo) y ajusta según tu target real.

## 4) Verifica arquitectura/paquete

- Si publicas APK universal, debe incluir ABI del dispositivo.
- Si cambiaste `applicationId/package`, puede parecer “otra app” o no actualizar.
- Si el `AndroidManifest.xml` no tiene actividad launcher (`MAIN` + `LAUNCHER`), la app se instala pero no aparece para abrir.

Ejemplo mínimo que **sí** debe existir en el manifest:

```xml
<activity android:name=".MainActivity" android:exported="true">
  <intent-filter>
    <action android:name="android.intent.action.MAIN" />
    <category android:name="android.intent.category.LAUNCHER" />
  </intent-filter>
</activity>
```

## 5) Inspecciona el error real con ADB

```bash
adb install -r app-debug.apk
adb logcat | grep -i -E "PackageManager|INSTALL_FAILED|FATAL EXCEPTION"
```

Esto te dirá exactamente si falló por firma, minSdk, permisos, parseo o conflicto de paquete.

## 6) Si no solicita ubicación al abrir

Con el cambio aplicado en `ProtectedRoute`, al entrar autenticado en runtime nativo, la app dispara
la solicitud foreground una vez por sesión.
