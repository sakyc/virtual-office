# Karyora branding

The active frontend uses the existing Karyora purple K monogram. Its shipped
SVG lives at `public/branding/karyora-mark.svg`; Vite copies it to the build.
The original design evidence remains in `output/branding/karyora-v1/`.

React headers and splash screens reuse `src/react/brand.jsx`. The standalone
Three.js entry uses the same SVG directly without changing the scene.
Both HTML entries reference it as their favicon. SPA page titles are defined
in `src/react/page-title.js` and updated when navigation changes.

Archived HTML design references and their conversion scripts are not the
live application. Re-running a design conversion must preserve these brand
overrides rather than reintroducing the old Virtual Office name and icon.

Check with `npm run build` and `node --test test/branding.test.js`.
This branding update does not establish production deployment readiness.
