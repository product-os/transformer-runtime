FROM docker:dind

COPY . .
ARG NPM_TOKEN

RUN apk add --no-cache docker-cli nodejs npm

RUN echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" >> .npmrc && \
    npm i && rm -f .npmrc

ENTRYPOINT [ "./scripts/entrypoint.sh" ]

CMD [ "npm", "run", "integration" ]
