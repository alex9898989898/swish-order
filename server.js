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

// === Load orders from file when server starts ===
let pastOrders = [];
const filePath = path.join(__dirname, "orders.json");

// Om filen inte finns, skapa den med tom array
if (!fs.existsSync(filePath)) {
  fs.writeFileSync(filePath, JSON.stringify([], null, 2));
  console.log("orders.json created!");
} else {
  try {
    pastOrders = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    console.log("Orders loaded from file:", pastOrders.length);
  } catch (err) {
    console.error("Error reading orders.json:", err);
    pastOrders = [];
  }
}

// === Save orders to file med felhantering ===
function saveOrders() {
  try {
    fs.writeFileSync(filePath, JSON.stringify(pastOrders, null, 2));
    console.log("Orders saved. Total orders:", pastOrders.length);
  } catch (err) {
    console.error("Error saving orders:", err);
  }
}

// === WebSocket logic ===
wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url.replace("/", ""));
  ws.screenType = params.get("type"); // screen1, history
  screenClients.push(ws);

  // Skicka gamla ordrar i rätt ordning (äldst → nyast)
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

  // Skicka till alla screen1-klienter
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

// === Swish Callback placeholder ===
// app.post("/swish-callback", (req, res) => {
//   console.log("Swish betalning klar:", req.body);
//   res.sendStatus(200);
// });
