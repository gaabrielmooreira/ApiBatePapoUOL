import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import Joi from 'joi';
import dayjs from 'dayjs'

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
const PORT = 5000;

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

try {
    await mongoClient.connect();
    db = mongoClient.db();
    console.log("MongoDB connection succesful!");
} catch (err) {
    console.log(err.message);
}

app.get("/participants", async (req, res) => {
    try {
        const participants = await db.collection("participants").find().toArray();
        res.send(participants);
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
})

app.post("/participants", async (req, res) => {
    const name = req.body.name;
    const nameSchema = Joi.object({
        name: Joi.string().required()
    });

    const validation = nameSchema.validate({ name });
    if (validation.error) return res.status(422).send(validation.error.details);


    const participantExist = await db.collection("participants").findOne({ name });
    if (participantExist) return res.status(409).send("Name has already been used.");

    try {
        await db.collection("participants").insertOne({ name, lastStatus: Date.now() });
        await db.collection("messages")
            .insertOne({
                from: name,
                to: 'Todos',
                text: 'entra na sala...',
                type: 'status',
                time: dayjs().format('HH:mm:ss')
            });
    } catch (err) {
        return console.log(err);
    }
    res.sendStatus(201);
})

app.get("/messages", async (req, res) => {
    const limit = req.query.limit;
    const user = req.headers.user;
    let messages;
    try {
        messages = await db.collection("messages").find().toArray();
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }

    const filterMessages = messages.filter(
        (message) => message.from === user ||
            message.to === 'Todos' ||
            message.to === user ||
            message.type === "status"
    )
    if(limit !== undefined){
        if (Number(limit) === 0 || Number(limit) < 0 || isNaN(limit)) return res.sendStatus(422);
        if (Number(limit) < filterMessages.length) return res.send(filterMessages.reverse().slice(0, limit));
    }
    res.send(filterMessages);
})

app.post("/messages", async (req, res) => {
    const from = req.headers.user;
    const { to, text, type } = req.body;
    try {
        const nameExist = await db.collection("participants").findOne({ name: from });
        if (!nameExist) return res.sendStatus(422);

        const messageSchema = Joi.object({
            to: Joi.string().required(),
            text: Joi.string().required(),
            type: Joi.string().valid('message', 'private_message').required()
        })

        const validation = messageSchema.validate({ to, text, type }, { abortEarly: false });
        if (validation.error) {
            const errors = validation.error.details.map((detail) => detail.message);
            return res.status(422).send(errors);
        }

        const newMessage = { from, to, text, type };

        await db.collection("messages").insertOne({ ...newMessage, time: dayjs().format("HH:mm:ss") });
    } catch (err) {
        console.log(err);
        return res.sendStatus(500);
    }
    return res.sendStatus(201);
})

app.post("/status", async (req, res) => {
    const name = req.headers.user;
    try {
        const result = await db.collection("participants").updateOne({ name }, { $set: { name, lastStatus: Date.now() } })
        if (result.modifiedCount === 0) return res.sendStatus(404);
    } catch (err) {
        console.log(err);
        return res.sendStatus(500);
    }
    res.send("OK");
})

async function autoRemove() {
    const participants = await db.collection("participants").find().toArray();
    if (!participants) return;
    const namesToRemove = participants
        .filter((p) => {
            const diff = (Date.now() - p.lastStatus) / 1000;
            return diff >= 10;
        })
        .map((p) => p.name);
    if (!namesToRemove) return;
    db.collection("participants").deleteMany({ name: { $in: namesToRemove } });
    namesToRemove.map((name) => db.collection("messages")
        .insertOne({
            from: name,
            type: 'status',
            text: 'sai da sala...',
        }));
}

setInterval(autoRemove, 15000);

app.listen(PORT, console.log(`Server started up in PORT: ${PORT}`));