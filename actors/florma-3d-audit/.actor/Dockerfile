# Node.js 22 + the Playwright library, Chromium and Google Chrome preinstalled.
#
# The `-slim` variant is the recommended flavour: it does not preinstall the
# Apify SDK / Crawlee / TypeScript, so package.json stays the single source of
# truth for dependency versions (per the Apify base-image docs).
#
# IMPORTANT: the browser binaries baked into the base image track the image's
# own Playwright version, which can differ from the version npm resolves from
# package.json. src/browser.ts therefore prefers the system Google Chrome
# (channel: 'chrome') and only falls back to bundled Chromium.
FROM apify/actor-node-playwright-chrome:22-slim

# Apify base images run as the non-root user `myuser` (workdir /home/myuser),
# so every COPY must set ownership explicitly rather than running chown later.
COPY --chown=myuser:myuser package*.json ./

RUN npm --quiet set progress=false \
    && npm install --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=optional --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

COPY --chown=myuser:myuser . ./

# Compile up front so a TypeScript error fails the build instead of the run.
# `npm start` rebuilds too, which keeps local and platform behaviour identical.
RUN npm run build

CMD npm start --silent
