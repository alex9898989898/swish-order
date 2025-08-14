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
let pastOrders = []; // Store all orders

// WebSocket connection
wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url.replace("/", ""));
  ws.screenType = params.get("type"); // screen1, history, etc.
  screenClients.push(ws);

  // Send orders to clients depending on type
  pastOrders.forEach(order => {
    if (ws.readyState === WebSocket.OPEN) {
      if (ws.screenType === "screen1" && !order.completed) {
        ws.send(JSON.stringify(order));
      } else if (ws.screenType === "history" && order.completed) {
        ws.send(JSON.stringify(order));
      }
    }
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "complete") {
        // Find order and mark as completed
        const order = pastOrders.find(o => o.orderNumber === data.orderNumber);
        if (order) {
          order.completed = true;

          // Notify all history clients
          screenClients.forEach(client => {
            if (client.screenType === "history" && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(order));
            }
          });
        }
      }
    } catch (e) {
      console.error("Fel vid WebSocket meddelande:", e);
    }
  });

  ws.on("close", () => {
    screenClients = screenClients.filter(c => c !== ws);
  });
});

// Handle upgrade
server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// Handle new orders
app.post("/order", (req, res) => {
  const { amount, message } = req.body;
  const orderNumber = Math.floor(Math.random() * 100000);

  const orderData = { orderNumber, amount, message, completed: false };
  pastOrders.push(orderData);

  console.log(`Ny beställning: ${orderNumber} - ${amount} kr - ${message}`);

  // Send to all screen1 clients
  screenClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.screenType === "screen1") {
      client.send(JSON.stringify(orderData));
    }
  });

  res.json({ status: "success", orderNumber });
});
