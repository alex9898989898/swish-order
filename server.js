const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

const wss = new WebSocket.Server({ noServer: true });
let screenClients = [];

// === Path to orders.json ===
const filePath = path.join(__dirname, "orders.json");

// === Load orders from file when server starts ===
let pastOrders = [];
try {
  if (fs.existsSync(filePath)) {
    pastOrders = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    console.log("Orders loaded from file:", pastOrders.length);
  } else {
    fs.writeFileSync(filePath, "[]", "utf-8");
    pastOrders = [];
    console.log("Created new orders.json file");
  }
} catch (err) {
  console.error("Error reading orders.json:", err);
  pastOrders = [];
}

// === Save orders to file ===
function saveOrders() {
  try {
    fs.writeFileSync(filePath, JSON.stringify(pastOrders, null, 2), "utf-8");
    console.log("Orders saved:", pastOrders.length);
  } catch (err) {
    console.error("Failed to save orders:", err);
  }
}

// === WebSocket logic ===
wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url.replace("/", ""));
  ws.screenType = params.get("type"); // screen1, history
  screenClients.push(ws);

  // Send old orders to the new client
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
        const order = pastOrders.find(o => o.orderNumber === data.orderNumber);
        if (order) {
          order.completed = true;
          saveOrders();

          // Notify history clients
          screenClients.forEach(client => {
            if (client.screenType === "history" && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(order));
            }
          });
        }
      }
    } catch (e) {
      console.error("WebSocket error:", e);
    }
  });

  ws.on("close", () => {
    screenClients = screenClients.filter(c => c !== ws);
  });
});

// === Upgrade WebSocket ===
server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// === API: New order ===
app.post("/order", (req, res) => {
  const { amount, message } = req.body;
  const orderNumber = Math.floor(Math.random() * 100000);
  const orderData = { orderNumber, amount, message, completed: false };

  pastOrders.push(orderData);
  saveOrders();

  // Send to all screen1 clients
  screenClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.screenType === "screen1") {
      client.send(JSON.stringify(orderData));
    }
  });

  res.json({ status: "success", orderNumber });
});

// === API: Clear history ===
app.post("/clear-history", (req, res) => {
  pastOrders = pastOrders.filter(order => !order.completed);
  saveOrders();

  screenClients.forEach(client => {
    if (client.screenType === "history" && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "clear" }));
    }
  });

  res.json({ status: "success" });
});

// === API: Swish Callback (optional) ===
// app.post("/swish-callback", (req, res) => {
//   console.log("Swish payment completed:", req.body);
//   res.sendStatus(200);
// });
