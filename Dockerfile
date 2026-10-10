# SignSphere: the app and its backend server in one container.
#   docker build -t signsphere .
#   docker run -p 8787:8787 -v signsphere-data:/data signsphere
# Data (logins, accounts, history, recorded signs) lives in /data — mount a volume there.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/gloss/package.json packages/gloss/
COPY services/api/package.json services/api/
RUN npm ci
COPY . .
# The app talks to the server on the same address.
ENV VITE_API_URL=/api
RUN npm run build --workspace @signsphere/web

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 SIGNSPHERE_DATA=/data
COPY package.json package-lock.json ./
COPY services/api/package.json services/api/
COPY apps/web/package.json apps/web/
COPY packages/gloss/package.json packages/gloss/
RUN npm ci --omit=dev --workspace @signsphere/api --include-workspace-root=false && npm cache clean --force
COPY services/api/src services/api/src
# The server builds its database from the same migrations as Supabase.
COPY supabase/migrations supabase/migrations
COPY --from=build /app/apps/web/dist apps/web/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/api/src/server.mjs"]
