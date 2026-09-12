# ClusterGuard Mobile

Expo React Native app for resident SOS alerts.

## Run locally

From the repository root:

```bash
npm install
npm run start --workspace @clusterguard/mobile
```

Use Expo Go for a quick preview, or run `npm run android --workspace @clusterguard/mobile` with an Android emulator/device configured.

The app runs in demo mode when the API is unavailable. To point it at a reachable backend, set `EXPO_PUBLIC_API_URL` before starting Expo. A physical Android device cannot use `localhost` for a computer-hosted API; use the computer's LAN IP or a deployed HTTPS endpoint.

## Build an APK

Install and authenticate with EAS CLI, then run:

```bash
npx eas login
npx eas build --platform android --profile preview
```

The `preview` profile creates an installable APK. The `production` profile creates an Android App Bundle for Play Store distribution:

```bash
npx eas build --platform android --profile production
```

The current API path is intentionally demo-tolerant. Supabase session tokens and FCM device registration still need to be connected before production release.
