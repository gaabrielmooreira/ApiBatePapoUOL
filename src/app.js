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
    const participants = [];
    try {
        const participants = await db.collection("participants").find().toArray();
        if (participants.length === 0) return res.send("No one participants so far.");
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }
    res.send(participants);
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
    const { limit } = req.query;
    const user = req.headers.user;
    const messages = [];
    const filterMessages = [];
    try {
        messages = await db.collection("messages").find();
        filterMessages = messages.filter((message) => {
            return (
                message.from === user || message.to === message.to === 'Todos' || message.to === user
            )
        })

        if (filterMessages.length === 0) return res.send("No messages.");
        if (limit) return res.send(filterMessages.slice(filterMessages.length - limit, filterMessages.length));
        
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
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
    
    const participants = await db.collection.find();

    const namesToRemove = participants.forEach((p) => {
        if((Date.now - p.lastStatus) >= 10000) return p.name; 
    })

    db.collection("participants").deleteMany({name: {$in: namesToRemove}});
    namesToRemove.map((name) => db.collection("messages")
    .insertOne({
        from: name,
        to: 'Todos',
        text: 'entra na sala...',
        type: 'status',
        time: dayjs().format('HH:mm:ss')
    }));
}

setInterval(autoRemove, 15000);

app.listen(PORT, console.log(`Server started up in PORT: ${PORT}`));