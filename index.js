require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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
  }
});

async function run() {
  try {

    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");


    const database = client.db("myDB");
    const userCollection = database.collection("users");
    const booksCollection = database.collection("books");

    
    
    // GET: Read all users
    app.get('/users', async (req, res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    app.post('/users', async (req, res) => {
      const newUser = req.body;
      const query = { email: newUser.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });
    //Books
    app.get('/books', async (req, res) => {
      const cursor = booksCollection.find().sort({ rating: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });
    app.post('/books', async (req, res) => {
      const newBook = req.body;
      console.log("Adding new book:", newBook);
      const result = await booksCollection.insertOne(newBook);
      res.send(result);
    });
    app.listen(port, () => {
      console.log(`🚀 Server is running on port: ${port}`);
    });

  } finally {

  }
}

run().catch(console.dir);
