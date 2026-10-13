# Frontend

Angular single-page application (standalone components, signals, Angular Material 3).

## Installing dependencies

Install packages with the `--legacy-peer-deps` flag:

```bash
npm install --legacy-peer-deps
```

> **Why `--legacy-peer-deps`?** The frontend `Dockerfile` and CI install with this flag, so a
> local install resolves the same dependency tree. The flag makes npm 7+ ignore peer dependencies
> while it builds the tree, as npm 3–6 did, so a peer-range conflict can't abort the install with
> `ERESOLVE`. `ng build` and `ng test` still run against the installed packages, so a real
> incompatibility still fails there.

## Development server

```bash
ng serve                    # http://localhost:4200
```

## Building

```bash
ng build                    # Production build into dist/
```

## Running unit tests

```bash
ng test
```

## Additional Resources

For the Angular CLI command reference, visit [angular.dev/tools/cli](https://angular.dev/tools/cli).
