const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const server = app.listen(port, () => {
  console.log(`Server körs på http://localhost:${port}`);
});

const wss = new WebSocket.Server({ noServer: true });
let screenClients = [];

wss.on("connection", (ws) => {
  screenClients.push(ws);
  ws.on("close", () => {
    screenClients = screenClients.filter((c) => c !== ws);
  });
});

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

app.post("/order", (req, res) => {
  const { amount, message } = req.body;
  const orderNumber = Math.floor(Math.random() * 100000);

  console.log(`Ny beställning: ${orderNumber} - ${amount} kr - ${message}`);

  screenClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(orderNumber.toString());
    }
  });

  res.json({ status: "success", orderNumber });
});
