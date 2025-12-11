require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
const admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- FIREBASE SETUP --- 
// const serviceAccount = require("./firebase-admin-key.json");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const verifyFireBaseToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  try {
    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(403).send({ message: 'Forbidden access' });
  }
};

// --- MONGODB SETUP ---
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

    // --- USER ROUTES ---

    app.get('/users', verifyFireBaseToken, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/role/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: "User not found", role: null });
        }
        res.send({ role: user.role || "user" });
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.post("/users", async (req, res) => {
      try {
        const newUser = req.body;
        const exists = await userCollection.findOne({ email: newUser.email });
        if (exists) {
          return res.send({ message: "User already exists", insertedId: null });
        }
        const result = await userCollection.insertOne(newUser);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.patch('/users/update/:email', verifyFireBaseToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded_email !== email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
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
    });

    app.patch('/users/:id', verifyFireBaseToken, async (req, res) => {
      const userId = req.params.id;
      const updates = req.body;
      const id = { _id: new ObjectId(userId) };
      const updateDoc = { $set: updates };
      const result = await userCollection.updateOne(id, updateDoc);
      res.send(result);
    });

    // --- BOOK ROUTES ---
    app.get('/books', async (req, res) => {
      const result = await booksCollection.find().sort({ price_USD: -1 }).toArray();
      res.send(result);
    });

    app.get('/books/:author', async (req, res) => {
      try {
        const authorName = req.params.author;
        const query = { author: authorName };
        const result = await booksCollection.find(query).sort({ date: -1 }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching books" });
      }
    });

    app.post('/books', verifyFireBaseToken, async (req, res) => {
      const newBook = req.body;
      newBook.added_date = new Date();
      const result = await booksCollection.insertOne(newBook);
      res.send(result);
    });

    app.delete('/books/:id', verifyFireBaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await booksCollection.deleteOne(query);
      if (result.deletedCount === 0) {
        return res.status(404).send({ message: "Book Not Found" });
      }
      res.send(result);
    });

    app.patch('/books/:id', verifyFireBaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const cleanData = Object.fromEntries(
          Object.entries(req.body).filter(([_, value]) => value !== undefined)
        );
        const updateDoc = { $set: cleanData };
        const result = await booksCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update book" });
      }
    });

    app.patch("/books/status/:id", verifyFireBaseToken, async (req, res) => {
      const id = req.params.id;
      const status = req.body;
      const query = { _id: new ObjectId(id) }
      const book = await booksCollection.findOne(query);

      if (!book) {
        return res.status(404).send({ message: "Book not found" });
      }
      if (req.decoded_email !== book.author) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const result = await booksCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: status } }
      );

      res.send(result);
    });

    // --- ORDER ROUTES ---
    app.get('/orders', verifyFireBaseToken, async (req, res) => {
      const query = {};
      const { email } = req.query;
      if (email && req.decoded_email !== email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      if (email) query.email = email;
      const options = { sort: { price: -1 } };
      const result = await ordersCollection.find(query, options).toArray();
      res.send(result);
    });
    //PAYMENT CHECKOUT
    app.post('/payment-checkout-session', async (req, res) => {
      const orderInfo = req.body;
      const price = parseInt(orderInfo.price) * 100;
      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: orderInfo.bookTitle,
                  images: [orderInfo.image]
                },
                unit_amount: price
              },
              quantity: 1
            }
          ],

          customer_email: orderInfo.email,
          mode: 'payment',
          metadata: {
            orderId: orderInfo._id.toString(),
            userEmail: orderInfo.email
          },

          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`
        });
        res.send({ url: session.url });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Stripe session failed" });
      }
    });

    app.patch('/payment-success', async (req, res) => {
      const session_id = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status === 'paid') {
        const id = session.metadata.orderId
        const transactionId = session.payment_intent
        const query = { _id: new ObjectId(id) }
        const update = {
          $set: {
            payment_status: 'paid',
            transactionId: transactionId,
            paymentDate: new Date()

          }
        }
        const result = ordersCollection.updateOne(query, update)
        res.send(result)
      }
      res.send({ success: false })
    })
    //ivoice
    app.get('/payments', async (req, res) => {
      const email = req.query.email;
      const query = {
        email: email,
        payment_status: 'paid'
      };
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/orders/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ordersCollection.findOne(query);
      res.send(result);
    });

    app.post('/orders', verifyFireBaseToken, async (req, res) => {
      const newOrder = req.body;
      if (req.decoded_email !== newOrder.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const exists = await ordersCollection.findOne({
        bookId: newOrder.bookId,
        email: newOrder.email,
      });
      if (exists) {
        return res.send({ message: "You have already ordered this book", insertedId: null });
      }
      const result = await ordersCollection.insertOne(newOrder);
      res.send(result);
    });

    app.delete('/orders/:id', verifyFireBaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await ordersCollection.deleteOne(query);
      if (result.deletedCount === 0) {
        return res.status(404).send({ message: "Order Not Found" });
      }
      res.send({ message: "Order Deleted Successfully", deletedId: id });
    });

    app.patch('/orders/cancel/:id', verifyFireBaseToken, async (req, res) => {
      const id = req.params.id;
      const order = await ordersCollection.findOne({ _id: new ObjectId(id) });
      if (!order) {
        return res.status(404).send({ message: "Order not found" });
      }
      if (req.decoded_email !== order.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      if (order.status !== 'pending') {
        return res.status(400).send({ message: "Only pending orders can be cancelled" });
      }
      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'cancelled' } }
      );
      res.send({ message: "Order cancelled successfully" });
    });

    //librarian orders 
    app.get('/librarian-orders/:author', verifyFireBaseToken, async (req, res) => {
      try {
        const author = req.params.author;
        if (!req.decoded_email) {
          return res.status(401).send({ message: "Unauthorized" });
        }
        const query = { author: author };

        const result = await ordersCollection.find(query).sort({ date: -1 }).toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error" });
      }
    });
    //Order Status 
    app.patch('/orders/status/:id', verifyFireBaseToken, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: status
        },
      };
      const result = await ordersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // --- STATS ---
    app.get('/stats', verifyFireBaseToken, async (req, res) => {
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
          totalUsers, admins, librarians, users, books, totalOrders, pendingOrders, cancelledOrders, completedOrders
        });
      } catch (error) {
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