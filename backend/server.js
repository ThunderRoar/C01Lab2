import express from "express";
import { Collection, MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import jwt, { decode } from "jsonwebtoken";

const app = express();
const PORT = 4000;
const mongoURL = "mongodb://localhost:27017";
const dbName = "quirknotes";

// Middleware for the request processing pipeline
app.use(express.json());

// Variable to connect to MongoDB
let db;

async function connectToMongo() {
  const client = new MongoClient(mongoURL);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    db = client.db(dbName);
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

connectToMongo();

// Open Port
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });

// Collections to manage
const COLLECTIONS = {
    notes: "notes",
    users: "users",
};

// Register a new user
app.post("/registerUser", async (req, res) => {
    try {
      const { username, password } = req.body;
  
      // Basic body request check
      if (!username || !password) {
        return res
          .status(400)
          .json({ error: "Username and password both needed to register." });
      }
  
      // Checking if username does not already exist in database
      const userCollection = db.collection(COLLECTIONS.users);
      const existingUser = await userCollection.findOne({ username });
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists." });
      }
  
      // Creating hashed password using bcrypt and storing user info in database
      const hashedPassword = await bcrypt.hash(password, 10);
      await userCollection.insertOne({
        username,
        password: hashedPassword,
      });
  
      // Returning JSON Web Token using JWT
      const token = jwt.sign({ username }, "secret-key", { expiresIn: "1h" });
      res.status(201).json({ response: "User registered successfully.", token });

      // res.json({ response: `Here's your username: ${username}` }); // Implicite status 200
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});

// Log in an existing user
app.post("/loginUser", async (req, res) => {
    try {
      const { username, password } = req.body;
  
      // Basic body request check
      if (!username || !password) {
        return res
          .status(400)
          .json({ error: "Username and password both needed to login." });
      }
  
      // Find username in database
      const userCollection = db.collection(COLLECTIONS.users);
      const user = await userCollection.findOne({ username });
  
      // Validate user against hashed password in database
      if (user && (await bcrypt.compare(password, user.password))) {
        const token = jwt.sign({ username }, "secret-key", { expiresIn: "1h" });
  
        // Send JSON Web Token to valid user
        res.json({ response: "User logged in succesfully.", token: token }); //Implicitly status 200
      } else {
        res.status(401).json({ error: "Authentication failed." });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});

// Post a note belonging to the user
app.post("/postNote", async (req, res) => {
    try {
      // Basic body request check
      const { title, content } = req.body;
      if (!title || !content) {
        return res
          .status(400)
          .json({ error: "Title and content are both required." });
      }
  
      // Verify the JWT from the request headers
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, "secret-key", async (err, decoded) => {
        if (err) {
          return res.status(401).send("Unauthorized.");
        }
  
        // Send note to database
        const collection = db.collection(COLLECTIONS.notes);
        const result = await collection.insertOne({
          title,
          content,
          username: decoded.username,
        });
        res.json({
          response: "Note added succesfully.",
          insertedId: result.insertedId,
        });
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});

// Retrieve a note belonging to the user
app.get("/getNote/:noteId", async (req, res) => {
    try {
      // Basic param checking
      const noteId = req.params.noteId;
      if (!ObjectId.isValid(noteId)) {
        return res.status(400).json({ error: "Invalid note ID." });
      }
  
      // Verify the JWT from the request headers
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, "secret-key", async (err, decoded) => {
        if (err) {
          return res.status(401).send("Unauthorized.");
        }
  
        // Find note with given ID
        const collection = db.collection(COLLECTIONS.notes);
        const data = await collection.findOne({
          username: decoded.username,
          _id: new ObjectId(noteId),
        });
        if (!data) {
          return res
            .status(404)
            .json({ error: "Unable to find note with given ID." });
        }
        res.json({ response: data });
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});

// Retrieving all notes from the Notes collections
app.get("/getAllNotes", async (req, res) => {
  try {
    // Validation
    const token = req.headers.authorization.split(" ")[1];
    jwt.verify(token, "secret-key", async (err, decoded) => {
      if (err) {
        return res.status(401).send("Unauthorized.");
      }

      // Find all notes beloing to the user
      // query by username
      const collection = db.collection(COLLECTIONS.notes);
      const data = await collection.find({
        username: decoded.username,
      });


      let allNotes = [];
      for await (const note of data) {
        allNotes.push(note);
      }

      res.json({ response: allNotes}); // implicit status 200
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a particular note from Notes collections
app.delete("/deleteNote/:noteId", async (req, res) => {
  try {
    const noteId = req.params.noteId;
    if (!ObjectId.isValid(noteId)) {
      return res.status(400).json({ error: "Invalid note ID." });
    }

    // Validation
    const token = req.headers.authorization.split(" ")[1];
    jwt.verify(token, "secret-key", async (err, decoded) => {
      if (err) {
        return res.status(401).send("Unauthorized.");
      }

      const collection = db.collection(COLLECTIONS.notes);
      // deleting the requested note
      const data = await collection.deleteOne({ 
        _id : new ObjectId(noteId), 
        username: decoded.username, 
      });

      if (!data || data.deletedCount == 0) {
        return res.status(404).json({ error: `Note with ID ${noteId} belonging to the user not found` });
      }

      res.json({ response: `Document with ID ${noteId} properly deleted.` });
    })
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Editing the note document in the Notes collection
app.patch("/editNote/:noteId", async (req, res) => {
  try {
    const { title, content } = req.body;
    const noteId = req.params.noteId;

    // Validation of the data receieved
    if (!title && !content) {
      return res.status(400).json({ error: "Invalid body paramamters." });
    } 

    if (!ObjectId.isValid(noteId)) {
      return res.status(400).json({ error: "Invalid note ID." });
    }
    

    const token = req.headers.authorization.split(" ")[1];
    jwt.verify(token, "secret-key", async (err, decoded) => {
      if (err) {
        return res.status(401).send("Unauthorized.");
      }

      const collection = db.collection(COLLECTIONS.notes);

      // Retrieve document if it exists
      const data = await collection.findOne({
        username: decoded.username,
        _id: new ObjectId(noteId),
      });

      // Validate the document
      if (!data) {
        return res.status(404).json({ error: `Note with ID ${noteId} belonging to the user not found` });
      }

      // Set the attributes that may change
      const updateDoc = {
        $set: {
          title: title ? title : data.title,
          content: content ? content : data.content, 
        }
      }

      // Update the document 
      const updateData = await collection.updateOne({ _id: new ObjectId(noteId), username: decoded.username }, updateDoc);

      if (!updateData || updateData.matchedCount == 0) {
        return res.status(404).json({ error: `Note with ID ${noteId} belonging to the user not found.` })
      }
      res.json({ response: `Document with ID ${noteId} properly updated`, data: updateData }); // implicit status 200
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
