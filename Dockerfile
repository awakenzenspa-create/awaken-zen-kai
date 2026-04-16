FROM node:20-slim

WORKDIR /app

# ── Step 1: Install heavy packages first (cached layer) ──────────────────────
# This layer only rebuilds if the versions below change.
# @sparticuz/chromium is ~100MB — isolating it prevents timeout on every deploy.
RUN npm install -g npm@latest && \
    npm install @sparticuz/chromium@^123.0.0 puppeteer-core@^22.0.0 --no-save

# ── Step 2: Install remaining app dependencies ───────────────────────────────
# --prefer-offline reuses the chromium already in the npm cache from Step 1
COPY package.json package-lock.json ./
RUN npm install --prefer-offline

# ── Step 3: Copy source ──────────────────────────────────────────────────────
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
