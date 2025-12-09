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
    const ordersCollection = database.collection("orders");


    // USER ROUTES
    // GET all users
    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    // GET user role by email
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
            insertedId: null,
          });
        }
        const result = await userCollection.insertOne(newUser);
        res.send(result);
      } catch (error) {
        console.error("POST /users error:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    //UPDATE user
    app.patch('/users/update/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const userUpdates = req.body;
        const filter = { email: email };
        const updateDoc = {
          $set: {
            name: userUpdates.name,
            photoURL: userUpdates.photoURL
          }
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).send({ message: "Failed to update user" });
      }
    });
    //Patch Role
    app.patch('/users/:id', async (req, res) => {
      try {
        const userId = req.params.id;
        const updates = req.body;
        const id = { _id: new ObjectId(userId) };
        const updateDoc = {
          $set: updates
        };
        const result = await userCollection.updateOne(id, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).send({ message: "Failed to update user" });
      }
    });

    // BOOK ROUTES
    // GET all books
    app.get('/books', async (req, res) => {
      const result = await booksCollection.find().sort({ price_USD: -1 }).toArray();
      res.send(result);
    });
    //Get books by User
    app.get('/books/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await ordersCollection.find(query).sort({ date: -1 }).toArray();
      res.send(result);
    });
    // POST add a new book
    app.post('/books', async (req, res) => {
      const newBook = req.body;
      const result = await booksCollection.insertOne(newBook);
      res.send(result);
    });
    // DELETE book by ID
    app.delete('/books/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await booksCollection.deleteOne(query);
        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Book Not Found" });
        }
        res.send(result);
      } catch (error) {
        console.error("Error deleting book:", error);
        res.status(500).send({ message: "Error deleting book" });
      }
    });


    //ORDER ROUTES
    // GET orders by email
    app.get('/orders', async (req, res) => {
      const query = {};
      const { email } = req.query;
      if (email) query.email = email;
      const options = { sort: { price: -1 } }
      const result = await ordersCollection.find(query, options).toArray();
      res.send(result);
    });
    // POST place order
    app.post('/orders', async (req, res) => {
      const newOrder = req.body;
      const exists = await ordersCollection.findOne({
        bookId: newOrder.bookId,
        email: newOrder.email,
      });
      if (exists) {
        return res.send({
          message: "You have already ordered this book",
          insertedId: null,
        });
      }
      const result = await ordersCollection.insertOne(newOrder);
      res.send(result);
    });
    // DELETE order by ID
    app.delete('/orders/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await ordersCollection.deleteOne(query);
        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Order Not Found" });
        }
        res.send({ message: "Order Deleted Successfully", deletedId: id });
      } catch (error) {
        console.error("Error deleting order:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
    // CANCEL ORDER
    app.patch('/orders/cancel/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const order = await ordersCollection.findOne({ _id: new ObjectId(id) });
        if (!order) {
          return res.status(404).send({ message: "Order not found" });
        }
        if (order.status !== 'pending') {
          return res
            .status(400)
            .send({ message: "Only pending orders can be cancelled" });
        }
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: 'cancelled' } }
        );
        res.send({ message: "Order cancelled successfully" });
      } catch (err) {
        console.error("Cancel Order Error:", err);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
    //Stats
    app.get('/stats', async (req, res) => {
      try {
        const totalUsers = await userCollection.countDocuments();
        const admins = await userCollection.countDocuments({ role: "admin" });
        const librarians = await userCollection.countDocuments({ role: "librarian" });
        const users = await userCollection.countDocuments({ role: "user" });
        const books = await booksCollection.countDocuments();
        const totalOrders = await ordersCollection.countDocuments();
        const pendingOrders = await ordersCollection.countDocuments({ status: "pending" });
        const cancelledOrders = await ordersCollection.countDocuments({ status: "cancelled" });
        const completedOrders = await ordersCollection.countDocuments({ status: "completed" });
        res.send({
          totalUsers,
          admins,
          librarians,
          users,
          books,
          totalOrders,
          pendingOrders,
          cancelledOrders,
          completedOrders
        });
      } catch (error) {
        console.error("Stats API Error:", error);
        res.status(500).send({ message: "Failed to load admin stats" });
      }
    });
  } catch (err) {
    console.error("Server Error:", err);
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send("Server Running");
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
