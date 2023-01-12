import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

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

app.get("/participants", async (req, res) => {
    try {
        const participants = await db.collection("participants").find().toArray();
        if(participants.length === 0) return res.send("Nenhum participante até o momento.");
        res.send(participants);
    } catch (err) {
        console.log(err);
        res.sendStatus(500);
    }

})

app.listen(process.env.PORT, console.log(`Servidor iniciado na porta ${process.env.PORT}`));
