FROM docker:dind

WORKDIR /build

COPY . .

RUN apk add --no-cache docker-cli nodejs=16.13.1-r0 npm=8.1.3-r0

ARG NPM_TOKEN
RUN echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" >> .npmrc && \
    npm ci && rm -f .npmrc

ENTRYPOINT [ "./scripts/entrypoint.sh" ]

CMD [ "npm", "run", "test:integration" ]
