import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';

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

    //USER Section
    // GET all users
    app.get('/users', async (req, res) => {
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
    })
    //User Ends here


    //BOOK Section 
    // GET All Books
    app.get('/books', async (req, res) => {
      const result = await booksCollection.find().sort({ price_USD: -1 }).toArray();
      res.send(result);
    });
    // Add New Book
    app.post('/books', async (req, res) => {
      const result = await booksCollection.insertOne(req.body);
      res.send(result);
    });

    app.delete('/books/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await booksCollection.deleteOne(query);
        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Book Not Found" })
        }
        res.send(result)
      } catch (err) {
        console.error("Error deleting book:", err);
        res.status(500).send({ message: "Error deleting book" });
      }
    })

  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send("Server Running");
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
