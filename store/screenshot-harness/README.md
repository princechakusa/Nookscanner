# App Store screenshot harness

Renders the **real capture-app screens** (`apps/nookscanner/src`, unchanged) in a browser with
react-native-web, with demo data in place of the live database (`stubs/`), then frames them for
the App Store (iPhone 6.9", 1320x2868).

The viewfinder shows real interior photos (`public/`, Unsplash License: free for commercial use)
where the phone shows the live camera.

```sh
cd store/screenshot-harness
npm install            # separate from the root workspace
npm run dev            # serves on :5199; leave running
npm run shoot          # raw/*.png: drives the app (sign in, plan, record, review, upload)
npm run compose        # ../app-store-screenshots/nookscanner-1..7.png
node guest-shoot.cjs   # guest 3D tour + appliance guide (needs: npm run dev -w apps/guest)
```

Re-run after any UI change so the store images always match the app.
