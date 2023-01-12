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

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

try {
    await mongoClient.connect();
    db = mongoClient.db();
    console.log("MongoDB connection succesful!");
} catch (err) {
    console.log(err.message);  
}

app.post("/participants", async (req,res) => {
    const name = req.body.name;
    const nameSchema = Joi.object({
        name: Joi.string()
    });

    try {
        nameSchema.validate({name});
    } catch(err) {
        console.log(err);
        return res.status(422).send("Invalid Name.");
    }

    const participantExist = await db.collection("participants").findOne({name});
    if(participantExist) return res.status(409).send("Name has already been used.");
    
    try {
        await db.collection("participants").insertOne({name, lastStatus: Date.now()});
        await db.collection("messages")
            .insertOne({
                from: name, 
                to: 'Todos', 
                text: 'entra na sala...',
                type: 'status',
                time: dayjs().format('HH:mm:ss')
            });
    } catch(err) {
        return console.log(err);
    }
    res.sendStatus(201);
})

app.get("/participants", async (req, res) => {
    try {
        const participants = await db.collection("participants").find().toArray();
        if(participants.length === 0) return res.send("No one participants so far.");
        res.send(participants);
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }

})

app.post("/messages", async (req,res) => {
    const from = req.headers.user;
    const {to, text, type} = req.body;

    const nameExist = await db.collection("participants").findOne({name:from});
    if(!nameExist) return res.sendStatus(422);

    const messageSchema = Joi.object({
        to: Joi.string().required(),
        text: Joi.string().required(),
        type: Joi.string().valid('message','private_message').required()
    })

    try {
        messageSchema.validate({to, text, type});
    } catch (err) {
        console.log(err);
        return res.sendStatus(422);
    }

    const newMessage = {from, to, text, type};

    db.collection("messages").insertOne({...newMessage, time: dayjs().format("HH:mm:ss")})

    return res.sendStatus(201);
})
app.listen(process.env.PORT, console.log(`Server started up in PORT: ${process.env.PORT}`));