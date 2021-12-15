FROM node:10
WORKDIR /app
COPY package.json /app
RUN npm install
RUN npm install -g nodemon esm
COPY . /app
CMD ["nodemon", "-r", "esm", "server.js"]
