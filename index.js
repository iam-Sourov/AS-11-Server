require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || '');
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 5000;

// --- CORS CONFIGURATION ---
// Use this SINGLE configuration. Do not use app.use(cors()) before this.
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://library-lyart-phi.vercel.app",
    "https://as-11-client.vercel.app",
    process.env.SITE_DOMAIN
  ].filter(Boolean), // Removes undefined values
  credentials: true
}));

app.use(express.json());

// --- FIREBASE SETUP ---
if (process.env.FB_SERVICE_KEY) {
  try {
    const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(decoded);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase admin initialized');
  } catch (err) {
    console.error('Firebase Init Error:', err);
  }
}

const verifyFireBaseToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).send({ message: 'unauthorized access' });
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

// Helper: Ensure DB connection is alive before every request
// This replaces the 'run()' function
async function connectDB() {
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
  }
  return client.db('myDB');
}

// --- ROUTES ---
// Note: We call await connectDB() inside every route

app.get('/', (req, res) => {
  res.send('Server IS Deployed!');
});

app.get('/users', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection('users').find().toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Failed to fetch users' });
  }
});

app.get('/users/role/:email', async (req, res) => {
  try {
    const db = await connectDB();
    const email = req.params.email;
    const user = await db.collection('users').findOne({ email });
    if (!user) return res.status(404).send({ message: 'User not found', role: null });
    res.send({ role: user.role || 'user' });
  } catch (error) {
    res.status(500).send({ message: 'Internal Server Error' });
  }
});

app.post('/users', async (req, res) => {
  try {
    const db = await connectDB();
    const newUser = req.body;
    const exists = await db.collection('users').findOne({ email: newUser.email });
    if (exists) return res.send({ message: 'User already exists', insertedId: null });
    const result = await db.collection('users').insertOne(newUser);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: 'Internal server error' });
  }
});

app.patch('/users/update/:email', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectDB();
    const email = req.params.email;
    if (req.decoded_email !== email) return res.status(403).send({ message: 'Forbidden access' });

    const userUpdates = req.body;
    const result = await db.collection('users').updateOne(
      { email: email },
      { $set: { name: userUpdates.name, photoURL: userUpdates.photoURL } }
    );
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Update failed' });
  }
});

app.patch('/users/:id', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection('users').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Failed to update user' });
  }
});

// --- BOOK ROUTES ---
app.get('/books', async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection('books').find().sort({ price_USD: -1 }).toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Failed to fetch books' });
  }
});

app.get('/books/:author', async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection('books').find({ author: req.params.author }).sort({ date: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching books' });
  }
});

app.post('/books', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectDB();
    const newBook = req.body;
    newBook.added_date = new Date();
    const result = await db.collection('books').insertOne(newBook);
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Book add failed' });
  }
});

app.delete('/books/:id', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection('books').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).send({ message: 'Book Not Found' });
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Delete failed' });
  }
});

app.patch('/books/:id', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectDB();
    const updatedBook = req.body;
    const result = await db.collection('books').updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          title: updatedBook.title,
          price: updatedBook.price,
          image: updatedBook.image_url,
          status: updatedBook.status,
          author: updatedBook.author,
          category: updatedBook.category,
          description: updatedBook.description,
          rating: updatedBook.rating
        }
      }
    );
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: 'Failed to update book' });
  }
});

// --- ORDER ROUTES ---
app.get('/orders', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectDB();
    const query = {};
    const { email } = req.query;
    if (email && req.decoded_email !== email) return res.status(403).send({ message: 'Forbidden access' });
    if (email) query.email = email;
    const result = await db.collection('orders').find(query, { sort: { price: -1 } }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching orders' });
  }
});

app.post('/payment-checkout-session', async (req, res) => {
  try {
    const orderInfo = req.body;
    const price = parseInt(orderInfo.price) * 100;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: orderInfo.bookTitle, images: [orderInfo.image] },
          unit_amount: price
        },
        quantity: 1
      }],
      customer_email: orderInfo.email,
      mode: 'payment',
      metadata: { orderId: orderInfo._id.toString(), userEmail: orderInfo.email },
      success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`
    });
    res.send({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Stripe session failed' });
  }
});

app.patch('/payment-success', async (req, res) => {
  try {
    const db = await connectDB();
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
    if (session.payment_status === 'paid') {
      const result = await db.collection('orders').updateOne(
        { _id: new ObjectId(session.metadata.orderId) },
        { $set: { payment_status: 'paid', transactionId: session.payment_intent, paymentDate: new Date() } }
      );
      return res.send(result);
    }
    res.send({ success: false });
  } catch (err) {
    res.status(500).send({ message: 'Payment verification failed' });
  }
});

app.get('/payments', async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection('orders').find({ email: req.query.email, payment_status: 'paid' }).toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Failed to load payments' });
  }
});

app.get('/orders/:id', async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Failed to fetch order' });
  }
});

app.post('/orders', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectDB();
    const newOrder = req.body;
    if (req.decoded_email !== newOrder.email) return res.status(403).send({ message: 'Forbidden access' });
    const exists = await db.collection('orders').findOne({ bookId: newOrder.bookId, email: newOrder.email });
    if (exists) return res.send({ message: 'You have already ordered this book', insertedId: null });
    const result = await db.collection('orders').insertOne(newOrder);
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Order failed' });
  }
});

app.delete('/orders/:id', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection('orders').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).send({ message: 'Order Not Found' });
    res.send({ message: 'Order Deleted Successfully', deletedId: req.params.id });
  } catch (err) {
    res.status(500).send({ message: 'Delete failed' });
  }
});

app.patch('/orders/cancel/:id', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectDB();
    const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).send({ message: 'Order not found' });
    if (req.decoded_email !== order.email) return res.status(403).send({ message: 'Forbidden access' });
    if (order.status !== 'pending') return res.status(400).send({ message: 'Only pending orders can be cancelled' });

    await db.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: 'cancelled' } }
    );
    res.send({ message: 'Order cancelled successfully' });
  } catch (err) {
    res.status(500).send({ message: 'Cancel failed' });
  }
});

app.get('/librarian-orders/:author', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection('orders').find({ author: req.params.author }).sort({ date: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: 'Server error' });
  }
});

app.patch('/orders/status/:id', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectDB();
    const result = await db.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: req.body.status } }
    );
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: 'Status update failed' });
  }
});

app.get('/stats', verifyFireBaseToken, async (req, res) => {
  try {
    const db = await connectDB();
    const [totalUsers, admins, librarians, users, books, totalOrders, pendingOrders, cancelledOrders, completedOrders] = await Promise.all([
      db.collection('users').countDocuments(),
      db.collection('users').countDocuments({ role: 'admin' }),
      db.collection('users').countDocuments({ role: 'librarian' }),
      db.collection('users').countDocuments({ role: 'user' }),
      db.collection('books').countDocuments(),
      db.collection('orders').countDocuments(),
      db.collection('orders').countDocuments({ status: 'pending' }),
      db.collection('orders').countDocuments({ status: 'cancelled' }),
      db.collection('orders').countDocuments({ status: 'completed' })
    ]);
    res.send({ totalUsers, admins, librarians, users, books, totalOrders, pendingOrders, cancelledOrders, completedOrders });
  } catch (error) {
    res.status(500).send({ message: 'Failed to load admin stats' });
  }
});

// --- VERCEL EXPORT ---
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });
}

module.exports = app;