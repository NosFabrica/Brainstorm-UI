`docker build -t brnstui --build-arg VITE_API_URL=https://api.example123.com --build-arg VITE_NIP85_RELAY_URL=wss://nip85.example.com .`

`docker run -d -p 3000:3000 --name brainstorm-ui brnstui`