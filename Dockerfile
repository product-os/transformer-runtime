FROM docker:dind

COPY . .

RUN apk add --no-cache docker-cli nodejs npm

ARG NPM_TOKEN
RUN echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" >> .npmrc && \
    npm i && rm -f .npmrc

ENTRYPOINT [ "./scripts/entrypoint.sh" ]

CMD [ "npm", "run", "integration" ]
