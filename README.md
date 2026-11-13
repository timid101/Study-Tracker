# Study Tracker (Android) 1.2

Daily study targets, focus timer, charts, reminders, a home-screen widget and a live timer in the notification bar.
Fully offline: the app has no internet permission, no sign-in and no cloud backup. Data stays on the phone.

## What is new in 1.1 and 1.2

- Study reminders at times you choose (skipped once the day's target is met).
- Session limit alert (25, 30, 45 minutes and more) and a "target reached" alert while the timer runs.
- Live timer in the notification bar while you study (Android counts it, even with the screen off).
- Square home-screen widget in a subject's colour showing the percentage of that subject's daily goal studied. Tap the subject name on the widget to switch subject, or use "Add widget for this subject" on the subject screen.
- Per-subject daily goal (Subjects > tap a subject). At the default it uses your overall daily target.
- No internet permission and no automatic cloud backup.

## Build the APK on GitHub (no Android Studio)

1. Upload everything in this folder to your repository (keep `.github`, `android`, `assets`, `www`).
2. Open **Actions > Build Android APK > Run workflow**.
3. When it finishes (about 5 minutes), download **study-tracker-apk** from the run's Summary page and unzip it.
4. Open `app-debug.apk` on the phone and install.

## Updating from 1.0

The 1.0 APK was signed with a temporary key, so Android will not install 1.1 over it.
1. In 1.0 open Settings > Backup & restore > Copy, and paste the text into a note.
2. Uninstall 1.0, install 1.1.
3. In 1.1 open Settings > Backup & restore, paste the text and tap Restore.

From 1.1 on every build uses the same key (`android/app/study-debug.keystore`), so later updates install over the top and keep your data.

## First use

- Allow notifications when asked (Android 13 and later). Reminders, alerts and the timer notification need it.
- Widget: Settings > Home screen widget > Add. If your launcher does not offer it, long-press the home screen, tap Widgets and pick "Study today".
- Some phones (Xiaomi, Oppo, Vivo) stop background apps. In the phone's battery settings set Study Tracker to "No restrictions" so reminders arrive on time.

## Changing the app

- Screens and logic: `www/index.html`, `www/app.js`, `www/app.css` (test by opening `www/index.html` in a browser).
- Android code: `android/app/src/main/java/com/tahmid/studytracker/`.
- After editing run `npx cap sync android`, then build.
