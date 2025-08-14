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

// WebSocket-anslutning
wss.on("connection", (ws) => {
  screenClients.push(ws);
  ws.on("close", () => {
    screenClients = screenClients.filter((c) => c !== ws);
  });
});

// Hantera upgrade för WebSocket
server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// Hantera nya orders
app.post("/order", (req, res) => {
  const { amount, message } = req.body;
  const orderNumber = Math.floor(Math.random() * 100000);

  console.log(`Ny beställning: ${orderNumber} - ${amount} kr - ${message}`);

  // Skicka hela objektet till alla anslutna clients
  const orderData = { orderNumber, amount, message };
  screenClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(orderData));
    }
  });

  res.json({ status: "success", orderNumber });
});
