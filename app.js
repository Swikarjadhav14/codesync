const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const fetch = require('node-fetch');
const { createClient } = require("redis");

// Load environment variables from .env file
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Create the Redis client using your Upstash URL from the .env file
const redisClient = createClient({
    url: process.env.REDIS_URL
});

redisClient.on('error', err => console.error('Redis Client Error', err));

(async () => {
    await redisClient.connect();
    console.log("Successfully connected to Upstash Redis.");
})();


app.use(express.static(path.join(__dirname, "client")));
app.use(express.json());

function generateSecretKey(length = 10) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let key = '';
    for (let i = 0; i < length; i++) {
        key += chars[Math.floor(Math.random() * chars.length)];
    }
    return key;
}

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "client", "index.html"));
});

app.get("/:roomId", (req, res) => {
    res.sendFile(path.join(__dirname, "client", "editorPage.html"));
});

app.post("/execute-code", async (req, res) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const { sourceCode, languageId } = req.body;
    const API_KEY =  process.env.API_KEY;
    const API_HOST = process.env.API_HOST
    const encodedSourceCode = Buffer.from(sourceCode).toString("base64");

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-RapidAPI-Key': API_KEY,
            'X-RapidAPI-Host': API_HOST,
        },
        body: JSON.stringify({
            submissions: [{
                language_id: parseInt(languageId),
                source_code: encodedSourceCode,
            }],
        }),
        signal: controller.signal
    };

    try {
        const response = await fetch(`https://${API_HOST}/submissions/batch?base64_encoded=true`, options);
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`API call failed with status: ${response.status}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error("Code execution failed: The request timed out.");
            return res.status(500).json({ error: "The code execution request timed out." });
        }
        console.error("Code execution failed:", error);
        res.status(500).json({ error: "Failed to execute code." });
    }
});

// --- Socket.IO Connection Handling ---
io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("join-request", async ({ roomId, userName }) => {
        try {
            const roomJSON = await redisClient.get(roomId);

            if (!roomJSON) {
                const secretKey = generateSecretKey();
                const newRoom = {
                    secretKey: secretKey,
                    participants: [{ id: socket.id, name: userName }]
                };
                await redisClient.set(roomId, JSON.stringify(newRoom), { EX: 86400 });
                await redisClient.set(socket.id, roomId, { EX: 86400 });

                console.log(`Room ${roomId} created by admin ${userName}. Secret Key: ${secretKey}`);
                socket.join(roomId);
                socket.emit("admin-init", {
                    secretKey: secretKey,
                    participants: newRoom.participants
                });
            } else {
                socket.emit("secret-key-required");
            }
        } catch (err) {
            console.error("Error in join-request:", err);
        }
    });

    socket.on("verify-key", async ({ roomId, userName, secretKey }) => {
        try {
            const roomJSON = await redisClient.get(roomId);
            if (!roomJSON) {
                return socket.emit("join-failed", "Room does not exist.");
            }

            const room = JSON.parse(roomJSON);

            if (room.secretKey === secretKey) {
                room.participants.push({ id: socket.id, name: userName });
                await redisClient.set(roomId, JSON.stringify(room));
                await redisClient.set(socket.id, roomId);

                socket.join(roomId);
                socket.emit("join-success", { participants: room.participants });
                io.to(roomId).emit("updateParticipants", room.participants);
                console.log(`${userName} successfully joined room ${roomId}`);
            } else {
                socket.emit("join-failed", "Invalid Secret Key.");
            }
        } catch (err) {
            console.error("Error in verify-key:", err);
        }
    });
    
    socket.on("textUpdate", async (text) => {
        const roomId = await redisClient.get(socket.id);
        if (roomId) {
            socket.to(roomId).emit("textUpdate", { id: socket.id, text });
        }
    });

    socket.on("user-message", async (message) => {
        const roomId = await redisClient.get(socket.id);
        if (roomId) {
            io.to(roomId).emit("message", message);
        }
    });

    socket.on("disconnect", async () => {
        try {
            const roomId = await redisClient.get(socket.id);
            if (roomId) {
                const roomJSON = await redisClient.get(roomId);
                if (roomJSON) {
                    const room = JSON.parse(roomJSON);
                    room.participants = room.participants.filter(p => p.id !== socket.id);

                    if (room.participants.length === 0) {
                        await redisClient.del(roomId);
                        console.log(`Room ${roomId} is empty and has been deleted.`);
                    } else {
                        await redisClient.set(roomId, JSON.stringify(room));
                        io.to(roomId).emit("updateParticipants", room.participants);
                    }
                }
            }
            await redisClient.del(socket.id);
            console.log("User disconnected:", socket.id);
        } catch (err) {
            console.error("Error in disconnect handler:", err);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});