# Study Tracker (Android)

Daily study targets, a focus timer, a 7-day chart, a 5-week heat map and time per subject.
Works offline. All data is stored on the phone.

## Get the APK (no Android Studio needed)

1. Create a new empty repository on GitHub and upload everything in this folder (keep the `.github` folder).
2. Open the repository's **Actions** tab, choose **Build Android APK**, then **Run workflow**.
3. When it finishes (about 4 to 6 minutes), open the run and download **study-tracker-apk**. Unzip it to get `app-debug.apk`.
4. Copy `app-debug.apk` to your phone and open it. Allow "Install unknown apps" for your file manager or browser when Android asks.

## Build on your own computer instead

Needs Node 20+, JDK 21 and Android Studio (for the Android SDK).

```
npm install
npx cap sync android
cd android
./gradlew assembleDebug        # Windows: gradlew.bat assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

## Change the app

- Screens, logic and styles: `www/index.html`, `www/app.js`, `www/app.css`.
- Test in a desktop browser by opening `www/index.html`.
- After any change run `npx cap sync android`, then build again.
- App icon and splash source images: `assets/`. Regenerate with `npx @capacitor/assets generate --android`.
- App name and id: `capacitor.config.json`.

The debug APK is signed with a debug key, which is fine for installing on your own phone.
A Play Store release needs your own signing key.
