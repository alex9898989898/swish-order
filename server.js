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
let pastOrders = []; // <-- Store all past orders

// Hantera WebSocket-anslutning med typ
wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url.replace("/", ""));
  ws.screenType = params.get("type"); // t.ex. "screen1" eller "screen"
  screenClients.push(ws);

  // Skicka alla tidigare orders direkt till denna client
  if (ws.screenType === "screen1" || ws.screenType === "screen") {
    pastOrders.forEach(order => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(order));
      }
    });
  }

  ws.on("close", () => {
    screenClients = screenClients.filter((c) => c !== ws);
  });
});

// Hantera upgrade
server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// Hantera nya orders
app.post("/order", (req, res) => {
  const { amount, message } = req.body;
  const orderNumber = Math.floor(Math.random() * 100000);

  const orderData = { orderNumber, amount, message };
  pastOrders.push(orderData); // <-- Save the order

  console.log(`Ny beställning: ${orderNumber} - ${amount} kr - ${message}`);

  // Skicka till alla clients med screenType="screen1" eller "screen"
  screenClients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      (client.screenType === "screen1" || client.screenType === "screen")
    ) {
      client.send(JSON.stringify(orderData));
    }
  });

  res.json({ status: "success", orderNumber });
});
