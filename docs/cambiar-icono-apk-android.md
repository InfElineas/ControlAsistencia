# Cambiar el ícono de la APK (Android + Capacitor)

## 1) Prepara tu nuevo ícono

- Crea una imagen base en: `resources/icon.png`
- Recomendado: **1024x1024 px**, PNG, fondo limpio.
- Evita texto pequeño (Android recorta con máscara adaptativa).

## 2) Genera assets de Android

Ejecuta:

```bash
npm run mobile:icon
```

Este comando usa `@capacitor/assets` para regenerar los iconos Android (`mipmap-*`).

## 3) Sincroniza y abre Android Studio

```bash
npm run mobile:build
npm run mobile:sync
npm run mobile:android
```

## 4) Compila nuevamente la APK

En Android Studio:
- **Build > Build Bundle(s) / APK(s) > Build APK(s)**

## 5) Si no cambia el icono en el teléfono

- Desinstala la app anterior.
- Vuelve a instalar la nueva APK.
- En algunos launchers, limpia caché del launcher.

## Nota importante

En este proyecto, el nombre de app mostrado debajo del icono se controla por `appName` en `capacitor.config.json`.
Si quieres cambiar también ese texto, edita `appName` y recompila.
