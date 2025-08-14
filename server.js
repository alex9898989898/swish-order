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
let activeOrders = []; // Orders that are not yet completed
let pastOrders = [];   // Completed orders / history

// Handle WebSocket connection
wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url.replace("/", ""));
  ws.screenType = params.get("type"); // e.g., "screen1" or "screen"
  screenClients.push(ws);

  // Send active orders first
  if (ws.screenType === "screen1" || ws.screenType === "screen") {
    activeOrders.forEach(order => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(order));
    });

    // Send past orders (history)
    pastOrders.forEach(order => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ...order, completed: true }));
    });
  }

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "complete") {
        // Move order from active to history
        const index = activeOrders.findIndex(o => o.orderNumber === data.orderNumber);
        if (index !== -1) {
          const completedOrder = activeOrders.splice(index, 1)[0];
          pastOrders.push(completedOrder);

          // Notify all clients to update their lists
          screenClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ ...completedOrder, completed: true }));
            }
          });
        }
      }
    } catch (e) {
      console.error("Fel vid meddelande:", e);
    }
  });

  ws.on("close", () => {
    screenClients = screenClients.filter((c) => c !== ws);
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

  const orderData = { orderNumber, amount, message };
  activeOrders.push(orderData); // <-- Save as active order

  console.log(`Ny beställning: ${orderNumber} - ${amount} kr - ${message}`);

  // Send to all clients
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
