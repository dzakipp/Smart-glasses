const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

// Pastikan folder uploads ada (untuk multer jika diperlukan nanti)
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// CORS — izinkan semua origin
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("MongoDB error:", err));

// Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key:    process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

// Model
const Photo = mongoose.model(
  "Photo",
  new mongoose.Schema({
    imageUrl:  String,
    createdAt: { type: Date, default: Date.now },
  })
);

// ── Routes ──────────────────────────────────────────────

// Test koneksi ESP32
app.get("/test", (req, res) => {
  console.log("ESP32 terhubung");
  res.send("OK");
});

// Upload foto dari ESP32 → simpan ke Cloudinary → simpan ke MongoDB
app.post(
  "/upload",
  express.raw({ type: "image/jpeg", limit: "10mb" }),
  async (req, res) => {
    try {
      const buffer = req.body;
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: "Buffer kosong" });
      }

      cloudinary.uploader
        .upload_stream({ resource_type: "image" }, async (err, result) => {
          if (err) {
            console.log("Cloudinary error:", err);
            return res.status(500).json(err);
          }

          const photo = await Photo.create({ imageUrl: result.secure_url });
          io.emit("new-photo", photo);
          res.json(photo);
        })
        .end(buffer);
    } catch (err) {
      console.log("Upload error:", err);
      res.status(500).json(err);
    }
  }
);

// Ambil semua foto (terbaru duluan)
app.get("/photos", async (req, res) => {
  try {
    const photos = await Photo.find().sort({ createdAt: -1 });
    res.json(photos);
  } catch (err) {
    res.status(500).json(err);
  }
});

// Hapus foto
app.delete("/photos/:id", async (req, res) => {
  try {
    await Photo.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.log("Delete error:", err);
    res.status(500).json(err);
  }
});

// Socket
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
