const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}
const allowedOrigins = [
  "http://localhost:5173",
  "https://smart-glasses.vercel.app"
];

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

let latestFrame = null;

console.log(process.env.MONGO_URI)
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET
});

const PhotoSchema = new mongoose.Schema({
  imageUrl: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

app.post("/frame", express.raw({ type: "image/jpeg", limit: "5mb" }), (req, res) => {
  latestFrame = req.body;
  res.sendStatus(200);
});

app.get("/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=frame",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  const interval = setInterval(() => {
    if (!latestFrame) return;

    res.write("--frame\r\n");
    res.write("Content-Type: image/jpeg\r\n");
    res.write(`Content-Length: ${latestFrame.length}\r\n\r\n`);
    res.write(latestFrame);
    res.write("\r\n");
  }, 100);

  req.on("close", () => clearInterval(interval));
});

const Photo = mongoose.model("Photo", PhotoSchema);
const upload = multer({ dest: "uploads/" });

app.post("/upload", upload.single("image"), async (req, res) => {

  try {

    const result = await cloudinary.uploader.upload(req.file.path);

    const photo = await Photo.create({
      imageUrl: result.secure_url
    });

    fs.unlinkSync(req.file.path);

    io.emit("new-photo", photo);

    res.json(photo);

  } catch (error) {

    console.log(error);

    res.status(500).json(error);
  }
});

app.get("/photos", async (req, res) => {
  const photos = await Photo.find().sort({ createdAt: -1 });
  res.json(photos);
});

app.delete("/photos/:id", async (req, res) => {
  try {
    console.log("DELETE HIT:", req.params.id);

    await Photo.findByIdAndDelete(req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(500).json(err);
  }
});

app.post("/control", (req, res) => {
  const { action } = req.body;

  io.emit("esp-command", action);

  res.json({
    success: true,
    action
  });
});

io.on("connection", (socket) => {
  console.log("Client Connected");
});

app.get("/test", (req, res) => {
  console.log("ESP32 TERHUBUNG");
  res.send("OK");
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});