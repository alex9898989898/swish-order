const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");
const https = require("https");
const axios = require("axios");

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

if (fs.existsSync(filePath)) {
  try {
    pastOrders = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    console.log("Orders loaded from file:", pastOrders.length);
  } catch (err) {
    console.error("Error reading orders.json:", err);
  }
}

// === Save orders to file ===
function saveOrders() {
  fs.writeFileSync(filePath, JSON.stringify(pastOrders, null, 2));
}

// === WebSocket logic ===
wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url.replace("/", ""));
  ws.screenType = params.get("type"); // screen1, history
  screenClients.push(ws);

  // Send old orders to new client
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

// === Swish configuration ===
const swishCertPath = "./SwishMerchantTestCertificate.p12";
const swishCAPath = "./SwishTLSRootCA.pem";
const swishCertPassword = "swish"; // Replace with your certificate password
const swishMerchantNumber = "1234679304"; // Replace with your Swish merchant number
const swishCallbackUrl = "https://yourserver.com/swish-callback"; // HTTPS required

async function createSwishPayment(order) {
  const instructionUUID = order.orderNumber.toString();
  const paymentRequest = {
    payeeAlias: swishMerchantNumber,
    amount: order.amount,
    currency: "SEK",
    payeePaymentReference: order.orderNumber.toString(),
    callbackUrl: swishCallbackUrl,
    message: order.message,
    callbackIdentifier: instructionUUID
  };

  try {
    const response = await axios.put(
      `https://mss.cpc.getswish.net/swish-cpcapi/api/v2/paymentrequests/${instructionUUID}`,
      paymentRequest,
      {
        httpsAgent: new https.Agent({
          pfx: fs.readFileSync(swishCertPath),
          passphrase: swishCertPassword,
          ca: fs.readFileSync(swishCAPath)
        }),
        headers: { "Content-Type": "application/json" }
      }
    );

    return response.headers.location; // Swish payment URL / QR
  } catch (error) {
    console.error("Swish payment error:", error.response?.data || error.message);
    return null;
  }
}

// === API: New order ===
app.post("/order", async (req, res) => {
  const { amount, message, payerAlias } = req.body;
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

  // Create Swish payment
  const qrUrl = await createSwishPayment(orderData);

  res.json({ status: "success", orderNumber, qrUrl });
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

// === API: Swish Callback ===
app.post("/swish-callback", (req, res) => {
  const callbackData = req.body;
  console.log("Swish callback received:", callbackData);

  const order = pastOrders.find(o => o.orderNumber.toString() === callbackData.callbackIdentifier);
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
  

  res.sendStatus(200); // Must respond 200 OK
});
