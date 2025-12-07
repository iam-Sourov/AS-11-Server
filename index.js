import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion } from 'mongodb';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@mystic.fupfbwc.mongodb.net/?appName=Mystic`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("MongoDB Connected!");

    const database = client.db("myDB");
    const userCollection = database.collection("users");
    const booksCollection = database.collection("books");

    // GET all users
    app.get('/users', async (_, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    //get user by role
    app.get('/users/role/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: "User not found", role: null });
        }
        res.send({ role: user.role || "user" });
      } catch (error) {
        console.error("Role API Error:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
    // POST new user
    app.post("/users", async (req, res) => {
      try {
        const newUser = req.body;
        const exists = await userCollection.findOne({ email: newUser.email });
        if (exists) {
          return res.send({
            message: "User already exists",
            insertedId: null
          });
        }
        const result = await userCollection.insertOne(newUser);
        res.send(result);
      } catch (error) {
        console.error("POST /users error:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // GET books
    app.get('/books', async (_, res) => {
      const result = await booksCollection.find().sort({ rating: -1 }).toArray();
      res.send(result);
    });

    // Add new book
    app.post('/books', async (req, res) => {
      const result = await booksCollection.insertOne(req.body);
      res.send(result);
    });

  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.get('/', (_, res) => {
  res.send("Server Running");
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
