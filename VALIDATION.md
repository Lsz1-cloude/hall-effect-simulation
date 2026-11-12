# Validation record

## Checks completed

- Exported source extracted and inspected; the original archive was not modified.
- Dependency installation completed using Node.js 24.19.0 and pnpm 11.25.0, with install scripts disabled. A lockfile was generated.
- Vite 8.3.8 production build passed both before and after the publication-packaging changes. The final build transformed 2,029 modules and produced HTML, CSS and JavaScript assets.
- No real .env file is included in the public-upload directory. The active Hall page does not import the Supabase client or authentication provider.
- Background audio is disabled and the external font declaration is removed. No physical constants, timing curves, motion equations or control behavior were changed.

## Limitations

- Build success is not a browser or WebGL interaction test. No completed browser-interaction or screenshot validation is claimed.
- No experimental or classroom validation has been performed here.
- Dependencies in the export used version ranges; the supplied lockfile records the resolution performed during this check, not necessarily the original hosted deployment.
- Vite reported a large JavaScript chunk and a warning about __dirname in its configuration. These did not stop the build.
- The model uses a prescribed charge-development curve and asymptotic field fraction of 0.98. See README.md for the exact telemetry definitions and model limitations.
