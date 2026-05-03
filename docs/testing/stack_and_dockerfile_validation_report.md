# Stack and Dockerfile Validation Report

| Test Repo / Fixture | Expected Stack | Detected Stack | Detection Result | Dockerfile Generated | Docker Build Result | Notes |
|---|---|---|---|---|---|---|
| aspnet | aspnet | aspnet | Pass | Yes | Pass | Build successful. |
| springboot-maven | springboot-maven | springboot-maven | Pass | Yes | Pass | Build successful. |
| springboot-gradle | springboot-gradle | springboot-gradle | Pass | Yes | Fail | Gradle ran successfully but `bootJar` failed because the fixture has no Java source files (Main class not found). |
| nextjs | nextjs | nextjs | Pass | Yes | Fail | `npm install` ran successfully but `npm run build` failed because the fixture `package.json` is missing the "build" script. |
| react | react | react | Pass | Yes | Fail | `npm install` ran successfully but `npm run build` failed because the fixture `package.json` is missing the "build" script. |
| unsupported | unsupported | Unsupported | Pass | No | N/A |  |

## Summary

**Repos/fixtures detected correctly:** aspnet, springboot-maven, springboot-gradle, nextjs, react, unsupported
**Repos/fixtures detected incorrectly:** None
**Dockerfiles built successfully:** aspnet, springboot-maven
**Dockerfiles failed to build:** springboot-gradle, nextjs, react

## Recommended Changes

All recommended changes have been applied to the Dockerfile templates. The templates are now robust against missing `package-lock.json` files and missing `gradle/` directories.

**Remaining Known Limitations:**
- `nextjs` and `react` templates still require the `package.json` to have a `"build"` script. This is standard for these frameworks, but if a user removes it, the build will fail.
- `springboot-gradle` and `springboot-maven` templates require standard Java structure (`src/main/java`).

**Fragile Assumptions:**
- The Node templates assume `npm start` (Next.js) or `nginx` serving `dist/` or `build/` (React) will work. If a user customizes their output folder (e.g., Vite outputting to `out/`), the React template's `COPY --from=build /app/dist` will fail.
