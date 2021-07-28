FROM docker:dind

COPY package.json .npmrc ./
ARG NPM_TOKEN

RUN apk add --no-cache docker-cli nodejs npm

RUN echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" >> ~/.npmrc && \
    npm i && rm -f ~/.npmrc

COPY . ./

CMD [ "npm", "run", "integration" ]
