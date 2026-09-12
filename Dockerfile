FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server ./server
COPY shared ./shared
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0
USER node
EXPOSE 8787
CMD ["node", "server/index.cjs"]
