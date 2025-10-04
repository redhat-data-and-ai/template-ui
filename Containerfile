FROM --platform=linux/amd64 node:24-alpine

WORKDIR /usr/app

COPY package*.json /usr/app
COPY src /usr/app/src
COPY public /usr/app/public

COPY components.json /usr/app/components.json
COPY eslint.config.js /usr/app/eslint.config.js
COPY vite.config.ts /usr/app/vite.config.ts
COPY vite-env.d.ts /usr/app/vite-env.d.ts
COPY tsconfig.json /usr/app/tsconfig.json
COPY tsconfig.node.json /usr/app/tsconfig.node.json

RUN npm ci \
    && npm run build

USER node

EXPOSE 8080

CMD "node" "dist/server/index.js"
