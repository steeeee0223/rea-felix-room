# The Recovered Room

A Vite and TypeScript demo of the 3D models recovered from Felix Rieseberg's portfolio.

## Local development

Use Node.js 26.13.0 and pnpm 12.16.1.

```sh
pnpm install
pnpm dev
```

Open the URL Vite prints. The gallery is at `/`, with interactive demos at `/computer/` and `/tv/`. The full recovered scene is at `/room/`.

```sh
pnpm typecheck
pnpm lint
pnpm format
pnpm build
pnpm preview
```

Vite builds the gallery and device pages from `src/` into `dist/`. It copies the models, textures, and original room runtime from `public/`. The TV channels and some room assets still load from the original asset host.

## Original static demo

`rea/` preserves the pre-Vite site recovered with REA. Run `pnpm dev:rea` from the repo root and open the URL it prints.
