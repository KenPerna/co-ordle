FROM node:22-slim
RUN npm install -g pnpm@9.15.9
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile
ARG BUILD_TARGET=api
RUN if [ "$BUILD_TARGET" = "web" ]; then \
      pnpm --filter @workspace/web-app run build && npm install -g serve; \
    else \
      pnpm --filter @workspace/api-server run build; \
    fi
RUN echo "#!/bin/sh\nif [ \"$BUILD_TARGET\" = \"web\" ]; then\n  exec serve artifacts/web-app/dist -p 3000\nelse\n  exec node --enable-source-maps artifacts/api-server/dist/index.mjs\nfi" > /start.sh && chmod +x /start.sh
CMD ["/start.sh"]
