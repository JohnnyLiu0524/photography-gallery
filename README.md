# Johnny Liu's Gallery2222222222

A personal photography gallery for city, nature, and people frames.

## Update photos

Add photos to `photos/`, then run:

```powershell
node scripts/update-photos-json.js
```

The script updates `photos.json` and `photos-data.js`.

## Manage photos locally

Run the local manager:

```powershell
npm run admin
```

Then open:

```text
http://127.0.0.1:4173/admin.html
```

The manager can upload photos, delete photos, drag to reorder, edit metadata, add or remove categories, set the featured photo, and save `photos.json`, `photos-data.js`, `categories.json`, and `categories-data.js`.

Use the manager server instead of `python -m http.server` when you need upload, delete, or save actions. The plain static server can preview the pages, but it cannot write files.
