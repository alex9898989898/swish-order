const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

const wss = new WebSocket.Server({ noServer: true });
let screenClients = [];
let pastOrders = []; // Store all orders

wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url.replace("/", ""));
  ws.screenType = params.get("type"); // screen1, history
  screenClients.push(ws);

  // Send past orders in correct order
  pastOrders.forEach(order => {
    if (ws.readyState === WebSocket.OPEN) {
      if (ws.screenType === "screen1" && !order.completed) {
        ws.send(JSON.stringify(order)); // äldsta först
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

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

app.post("/order", (req, res) => {
  const { amount, message } = req.body;
  const orderNumber = Math.floor(Math.random() * 100000);
  const orderData = { orderNumber, amount, message, completed: false };

  pastOrders.push(orderData); // äldsta order längst bak

  // Skicka nya order till screen1 – append längst ner på klienten
  screenClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.screenType === "screen1") {
      client.send(JSON.stringify(orderData));
    }
  });

  res.json({ status: "success", orderNumber });
});

// Clear all completed orders
app.post("/clear-history", (req, res) => {
  pastOrders = pastOrders.filter(order => !order.completed);
  screenClients.forEach(client => {
    if (client.screenType === "history" && client.readyState === WebSocket.OPEN){
      client.send(JSON.stringify({ type: "clear" }));
    }
  });
  res.json({ status: "success" });
});
