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
    origin: [
      "http://localhost:5173",
      "https://smart-glasses.vercel.app"
    ],
    methods: ["GET", "POST"]
  }
});
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}
const allowedOrigins = [
  "http://localhost:5173",
  "https://smart-glasses.vercel.app"
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

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

    await Photo.findByIdAndDelete(req.params.id);

    res.json({
      success: true
    });

  } catch (error) {

    console.log(error);

    res.status(500).json(error);
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