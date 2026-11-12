# Hall-effect interactive teaching model

React, TypeScript and Three.js source for the interactive Hall-effect teaching resource accompanying the manuscript **AI-Assisted Interactive Modeling of the Hall Effect: An Instructional Design for University Physics from Formula Verification to Mechanistic Explanation**.

Authors: Kezhao Xiong, Yingying Zhang, Yaxiao Ciu and Jingyi Yang. Affiliation: Xi'an University of Science and Technology, Xi'an, China. Correspondence: xiongkezhao@outlook.com.

## Requirements and installation

Use Node.js 24 (validated with 24.19.0), pnpm 11.25.0, and a current browser supporting WebGL. Internet access is needed for dependency installation. The interface is primarily in Chinese. No account or backend credentials are required for the Hall-effect page.

From this folder:

```sh
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

Open the local address printed by Vite (normally http://127.0.0.1:5173/). Run the app through the server rather than opening index.html directly.

```sh
pnpm build
pnpm preview
```

The generated `dist/` folder is the static production build. If your installation reports a missing native optional dependency, reinstall for your operating system using the same Node/pnpm versions. This repository includes a newly generated lockfile; it is not a record of the original hosted deployment's dependency versions.

## Controls

- The current I and magnetic flux density B sliders range from 0 to 10, in steps of 0.1. Exported defaults are I = 5 and B = 5. Set B to 0.20 for the manuscript's representative low-field setting.
- Start the simulation using the top switch. Parameter sliders are locked while it runs; stop it before changing I or B.
- Reverse the magnetic field using the second switch. The displayed Hall-voltage polarity changes with the field direction.
- Drag to rotate the three-dimensional view and scroll to zoom. Reset restores the exported defaults.
- The panel displays the animation phase, current, magnetic field, Hall field, accumulated-charge indicator and Hall voltage.

## Model interpretation and limitations

This is a schematic instructional animation, not a calibrated semiconductor transport solver. The illustrative steady-state relation is V_H = 0.18 I B (V, A, T). Particle sizes, spatial dimensions, timing and trajectory scaling are instructional representations.

The implementation uses a prescribed smooth charge-development curve. The displayed phase changes at animation times 4.4 and 22 seconds. A damped chargeLevel drives the Hall-field fraction, which is `0.98 * chargeLevel`. The instantaneous displayed voltage is `0.18 * I * B * fieldFraction * fieldSign`; E_H is that value divided by 2. The displayed charge indicator is `2 * chargeLevel * (0.18 * I * B)`. These definitions do not solve Poisson's equation or infer a physical relaxation time. For I and B both at least 0.5, the settled voltage approaches 98% of the panel's theoretical voltage. Below either threshold, additional smoothstep scaling reduces chargeLevel and the displayed voltage further. Charge and field indicators are prescribed representations rather than experimentally calibrated measurements.

Electron deflection responds to B and the prescribed field fraction. Charge accumulation is not computed by counting electron impacts. Consequently, visual stages must not be presented as independent numerical evidence for the Hall relation or a self-consistent simulation of charge relaxation.

## Important source files

- `src/components/hall/HallScene.tsx`: Three.js scene, electron trajectories, animation timing and telemetry.
- `src/components/hall/constants.ts`: illustrative coefficient, defaults and geometric constants.
- `src/components/hall/ControlPanel.tsx`: switches, sliders and displayed readings.
- `src/pages/HallEffectPage.tsx`: page state and component connections.

## Publication preparation

The original export's real `.env` is excluded. `.env.example` documents only variable names. Supabase/authentication scaffold files are retained but are not used by the active Hall-effect page. External background music is disabled and the remote font request is removed; browser fallback fonts are used. The simulation logic and parameter controls are unchanged. The original export README is retained under docs for provenance.

Dependency install and production build were checked locally; see `VALIDATION.md` for the precise checks and limitations. The code still requires author review of physical accuracy and agreement with the manuscript. A public GitHub repository alone does not grant an open-source license; no new license has been chosen on behalf of the authors.
