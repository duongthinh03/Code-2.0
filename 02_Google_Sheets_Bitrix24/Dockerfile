FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY tsconfig.json mapping.json ./
RUN mkdir /state && chown node:node /state
USER node
ENV STATE_DIR=/state
CMD ["npm", "run", "sync:dry"]
