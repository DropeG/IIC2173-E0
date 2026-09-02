const amqp = require("amqplib");
const fs = require("fs");
require("dotenv").config();

const MASTER_URL = process.env.MASTER_URL || "http://master:3000/events";
const RABBIT_HOST = process.env.RABBITMQ_HOST || "broker.iic2173.org";
const RABBIT_PORT = process.env.RABBITMQ_PORT || "5671";
const RABBIT_PROTOCOL = process.env.RABBITMQ_PROTOCOL || "amqps";
const RABBIT_USER = process.env.RABBITMQ_USER || "user";
const RABBIT_PASS = process.env.RABBITMQ_PASS || "pass";
const RABBIT_QUEUE = process.env.RABBITMQ_QUEUE || "observer.0.q";
const RABBITMQ_URL = process.env.RABBITMQ_URL || `amqps://user:pass@broker.iic2173.org:5671/energy`;

const HEARTBEAT_FILE = "/tmp/heartbeat";
const RETRY_INTERVAL_MS = 5000;

// Update heartbeat timestamp for Docker HEALTHCHECK
function touchHeartbeat() {
  try {
    fs.writeFileSync(HEARTBEAT_FILE, new Date().toISOString(), "utf8");
  } catch (err) {
    // Ignore heartbeat write errors
  }
}

setInterval(touchHeartbeat, 5000);
touchHeartbeat();

async function sendToMaster(eventData) {
  try {
    const response = await fetch(MASTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventData),
    });

    if (response.ok) {
      console.log(`✅ [Connector] Event ${eventData.idpk || "unknown"} forwarded to master successfully.`);
      return true;
    } else {
      const text = await response.text();
      console.error(`⚠️ [Connector] Master rejected event (HTTP ${response.status}):`, text);
      return false;
    }
  } catch (error) {
    console.error("⚠️ [Connector] Failed to communicate with master API:", error.message);
    return false;
  }
}

async function startConsumer() {
  const amqpUrl = RABBITMQ_URL;
  
  console.log(`🔌 [Connector] Attempting to connect to RabbitMQ broker at ${amqpUrl.split("@")[1] || amqpUrl} (Queue: ${RABBIT_QUEUE})...`);

  try {
    const connection = await amqp.connect(amqpUrl, {
      heartbeat: 30,
      clientProperties: { connection_name: `energyshark-connector-${RABBIT_QUEUE}` },
    });

    connection.on("error", (err) => {
      console.error("❌ [Connector] RabbitMQ connection error:", err.message);
    });

    connection.on("close", () => {
      console.warn(`⚠️ [Connector] RabbitMQ connection closed. Reconnecting in ${RETRY_INTERVAL_MS / 1000}s...`);
      setTimeout(startConsumer, RETRY_INTERVAL_MS);
    });

    const channel = await connection.createChannel();
    await channel.prefetch(10);

    // Assert queue (passive: true in case queue is pre-configured by teachers)
    try {
      await channel.checkQueue(RABBIT_QUEUE);
    } catch (e) {
      console.log(`ℹ️ [Connector] Queue check note: ${e.message}. Ensuring queue exists...`);
      await channel.assertQueue(RABBIT_QUEUE, { durable: true });
    }

    console.log(`🎧 [Connector] Connected and listening for messages on queue: ${RABBIT_QUEUE}`);

    channel.consume(
      RABBIT_QUEUE,
      async (msg) => {
        if (!msg) return;

        touchHeartbeat();
        const contentStr = msg.content.toString();
        
        try {
          const parsed = JSON.parse(contentStr);
          console.log(`📥 [Connector] Received message idpk=${parsed.idpk || "none"} type=${parsed.type || "none"}`);
          
          const success = await sendToMaster(parsed);
          if (success) {
            channel.ack(msg);
          } else {
            // Requeue or nack if master is unavailable
            channel.nack(msg, false, true);
          }
        } catch (parseErr) {
          console.error("❌ [Connector] Invalid JSON message received:", contentStr);
          // Acknowledge malformed message to avoid poisoning the queue
          channel.ack(msg);
        }
      },
      { noAck: false }
    );
  } catch (err) {
    console.error(`❌ [Connector] Connection attempt failed (${err.message}). Retrying in ${RETRY_INTERVAL_MS / 1000}s...`);
    setTimeout(startConsumer, RETRY_INTERVAL_MS);
  }
}

console.log("🚀 Starting EnergyShark Connector service...");
startConsumer();
