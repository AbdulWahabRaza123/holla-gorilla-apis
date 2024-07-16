require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cors = require("cors"); // Import the CORS middleware

const { specs, swaggerUi } = require("./config/swagger");

const db = require("./config/dbConnection");
const setupQueries = require("./components/queries");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// APP SETUP
const port = 3000;

app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve Swagger UI
app.use(
  "/api-docs",
  express.static("node-modules/swagger-ui-dist/", { index: false }),
  swaggerUi.serve,
  swaggerUi.setup(specs)
);

// DB Connection
db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    return;
  }
  console.log("Connected to MySQL");

  db.query(setupQueries, (err, results) => {
    if (err) {
      console.error("Error setting up database:", err);
      return;
    }
    console.log("Database setup complete");
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  });
});

// Helper functions
const {
  calculateDistance,
  uploadToCloudinary,
  validateSignup,
  authenticateToken,
} = require("./utils");
const { machine } = require("os");

// Message handling

// const { app_id, from, to, message } = req.body;
// // const query = `
// // INSERT INTO messages
// // (app_id,from_user,to_user,message) VALUES (?,?,?,?)
// // `;
// //let queryParams = [app_id,from,to,message];

// Function to handle message sending
const sendMessage = (app_id, from, to, message, callback) => {
  const query =
    "INSERT INTO messages (app_id, from_user, to_user, message) VALUES (?, ?, ?, ?)";
  db.query(query, [app_id, from, to, message], (err, results) => {
    if (err) {
      callback(err, null);
      return;
    }

    const newMessage = { app_id, from, to, message };
    io.emit("newMessage", newMessage);
    callback(null, newMessage);
  });
};

// WebSocket connection handler
io.on("connection", (socket) => {
  console.log("New client connected");

  //event to join a room
socket.on("joinRoom", ({ room }) => {
  socket.join(room);
  console.log(`User joined room: ${room}`);
  socket.emit("Joined");
});


  socket.on("sendMessage", (data) => {
  console.log("sendMessage event received:", data);
  const { app_id, from, to, message } = data;
  sendMessage(app_id, from, to, message, (err, newMessage) => {
    if (err) {
      console.log("Error sending message:", err);
      socket.emit("messageError", "Error sending message");
      return;
    }
    console.log("Message sent successfully:", newMessage);
    io.to(`room_${from}`).emit("newMessage", newMessage);
    io.to(`room_${to}`).emit("newMessage", newMessage);
  });
});


/**
 * @swagger
 * /send-message:
 *   post:
 *     summary: Send a new message
 *     description: Send a new message from one user to another within a specific application.
 *     tags: [Messages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               app_id:
 *                 type: string
 *                 description: The ID of the application.
 *                 example: "1"
 *               from:
 *                 type: string
 *                 description: The ID of the user sending the message.
 *                 example: "2"
 *               to:
 *                 type: string
 *                 description: The ID of the user receiving the message.
 *                 example: "4"
 *               message:
 *                 type: string
 *                 description: The content of the message.
 *                 example: "Hello, how are you?"
 *     responses:
 *       200:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "true"
 *                 message:
 *                   type: string
 *                   example: "Message Sent Successfully"
 *                 newMessage:
 *                   type: object
 *                   description: The details of the newly sent message
 *       400:
 *         description: Bad request, missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "All fields are required"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error sending message"
 */

// POST API endpoint
app.post("/send-message", upload.none(), authenticateToken, (req, res) => {
  const { app_id, from, to, message } = req.body;

  if (!app_id || !from || !to || !message) {
    return res.status(400).json({ error: "All fields are required" });
  }

  sendMessage(app_id, from, to, message, (err, newMessage) => {
    if (err) {
      return res.status(500).json({ error: "Error sending message" });
    }
    res.status(200).json({
      status: "true",
      message: "Message Sent Successfully",
      newMessage,
    });
  });
});

// All Implemented APIs

// GET APIs
/**
 * @swagger
 * /get-messages:
 *   get:
 *     summary: Get messages between two users
 *     tags: [Messages]
 *     parameters:
 *       - in: query
 *         name: app_id
 *         schema:
 *           type: string
 *         required: true
 *         description: The application ID
 *       - in: query
 *         name: user1
 *         schema:
 *           type: string
 *         required: true
 *         description: The first user ID
 *       - in: query
 *         name: user2
 *         schema:
 *           type: string
 *         required: true
 *         description: The second user ID
 *     responses:
 *       200:
 *         description: A list of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
app.get("/get-messages", authenticateToken, (req, res) => {
  const { app_id, user1, user2 } = req.query;
  const query = `
    SELECT * FROM messages 
    WHERE app_id = ? AND 
    ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))
    ORDER BY timestamp ASC
  `;

  db.query(query, [app_id, user1, user2, user2, user1], (err, results) => {
    if (err) {
      return res.status(500).send("Error retrieving messages");
    }
    res.json(results);
  });
});

app.get("/getUserMessages", authenticateToken, async (req, res) => {
  try {
    const { userID, chatterID } = req.query;
    let query = `SELECT * FROM messages WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?) WHERE app_id = ?`;
    let queryParams = [userID, chatterID, chatterID, userID, 1];
    db.query(query, queryParams, (err, result) => {
      if (err) {
        return res.status(500).json({
          status: false,
          message: "Could Not get Messages",
          error: err.message,
        });
      }
      let retMessages = result.map((msg) => {
        return msg;
      });
      res.status(200).json({
        status: true,
        message: "Chat fetched successfully",
        retMessages,
      });
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: false, message: "the API FAILED", error: error.message });
  }
});

/**
 * @swagger
 * /get-recentMessages:
 *   get:
 *     summary: Get recent messages
 *     description: Retrieve the most recent messages sent and received by a user within a specific application.
 *     tags:
 *       - Messages
 *     parameters:
 *       - in: query
 *         name: app_id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the application.
 *         example: "1"
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the user.
 *         example: "2"
 *     responses:
 *       200:
 *         description: Recent messages retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   from_user:
 *                     type: string
 *                     description: The ID of the user who sent the message.
 *                     example: "3"
 *                   to_user:
 *                     type: string
 *                     description: The ID of the user who received the message.
 *                     example: "2"
 *                   message:
 *                     type: string
 *                     description: The content of the message.
 *                     example: "Hello, how are you?"
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                     description: The timestamp when the message was sent.
 *                     example: "2024-07-10T05:32:44.000Z"
 *       400:
 *         description: Bad request, missing required parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "All fields are required"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error retrieving messages"
 */
const queryDb = (query, params) => {
  return new Promise((resolve, reject) => {
    db.query(query, params, (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

app.get("/get-recentMessages", authenticateToken, async (req, res) => {
  const { app_id, user_id } = req.query;

  const query = `
    SELECT from_user, to_user, message, timestamp
    FROM (
      SELECT 
        m.from_user, m.to_user, m.message, m.timestamp,
        ROW_NUMBER() OVER (PARTITION BY LEAST(m.from_user, m.to_user), GREATEST(m.from_user, m.to_user) ORDER BY m.timestamp DESC) AS rn
      FROM messages m
      WHERE m.app_id = ? AND (m.from_user = ? OR m.to_user = ?)
    ) AS recent_messages
    WHERE rn = 1
    ORDER BY timestamp DESC;
  `;

  try {
    const messages = await queryDb(query, [app_id, user_id, user_id]);

    const userPromises = messages.map(async (message) => {
      const userQuery = `SELECT * FROM users WHERE id = ?`;
      if (user_id == message.from_user) {
        const user = await queryDb(userQuery, [message.to_user]);
        return {
          ...message,
          user: user[0],
        };
      } else {
        const user = await queryDb(userQuery, [message.from_user]);
        return {
          ...message,
          user: user[0],
        };
      }
    });

    const messagesWithUsers = await Promise.all(userPromises);

    res.status(200).json(messagesWithUsers);
  } catch (err) {
    console.error("Error retrieving messages:", err);
    res.status(500).send("Error retrieving messages");
  }
});

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: A list of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
app.get("/users", authenticateToken, (req, res) => {
  const query = "SELECT * FROM users WHERE status = ?";
  const queryParams = ["ACTIVE"];

  db.query(query, queryParams, (err, result) => {
    if (err) {
      return res
        .status(500)
        .json({ status: false, message: err.message, users: null });
    }

    let users = result.map((user) => {
      user.longitude = parseFloat(user.longitude);
      user.latitude = parseFloat(user.latitude);

      return user;
    });

    res
      .status(200)
      .json({ status: true, message: "Users fetched successfully", users });
  });
});

// Getting User by ID API
/**
 * @swagger
 * /users/id/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: The user ID
 *     responses:
 *       200:
 *         description: A single user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
app.get("/users/id/:id", authenticateToken, (req, res) => {
  const { id } = req.params;

  db.query("SELECT * FROM users WHERE id = ?", [id], (err, result) => {
    if (err) {
      return res
        .status(500)
        .json({ status: false, message: err.message, user: null });
    }
    if (result.length === 0) {
      return res
        .status(404)
        .json({ status: false, message: "User not found", user: null });
    }

    const user = result[0];

    res
      .status(200)
      .json({ status: true, message: "User fetched successfully", user });
  });
});

/**
 * @swagger
 * /users/exists/{contact}:
 *   get:
 *     summary: Check if user exists by contact
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: contact
 *         schema:
 *           type: string
 *         required: true
 *         description: The user contact
 *     responses:
 *       200:
 *         description: User exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
app.get("/users/exists/:contact", (req, res) => {
  const { contact } = req.params;

  db.query(
    "SELECT * FROM users WHERE contact = ? AND status = ?",
    [contact, "ACTIVE"],
    (err, result) => {
      if (err) {
        return res.status(500).json({ status: false, message: err.message });
      }
      if (result.length === 0) {
        return res
          .status(404)
          .json({ status: false, message: "User does not exist", user: null });
      }

      let user = result[0];

      const token = jwt.sign(
        { contact: user.contact },
        process.env.JWT_SECRET_KEY
      );

      user.longitude = parseFloat(user.longitude);
      user.latitude = parseFloat(user.latitude);

      res
        .status(200)
        .json({ status: true, message: "User exists", user, token });
    }
  );
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: Default API
 *     tags: [Default]
 *     responses:
 *       200:
 *         description: A welcome message
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
app.get("/", (req, res) => {
  res.send("Hello, world!");
});

/**
 * @swagger
 * /users/getUsers:
 *   get:
 *     summary: Get users based on filters
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID of the user making the request
 *       - in: query
 *         name: longitude
 *         schema:
 *           type: number
 *         description: Longitude of the user's location
 *       - in: query
 *         name: latitude
 *         schema:
 *           type: number
 *         description: Latitude of the user's location
 *       - in: query
 *         name: gender
 *         schema:
 *           type: string
 *         description: Gender filter, can be multiple values separated by commas
 *       - in: query
 *         name: ageRange
 *         schema:
 *           type: string
 *         description: Age range filter in the format minAge-maxAge
 *       - in: query
 *         name: interests
 *         schema:
 *           type: string
 *         description: Interests filter, can be multiple values separated by commas
 *       - in: query
 *         name: radRange
 *         schema:
 *           type: string
 *         description: Radius range filter in the format minRange-maxRange
 *     responses:
 *       200:
 *         description: List of users matching the filters
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   full_name:
 *                     type: string
 *                   contact:
 *                     type: string
 *                   gender:
 *                     type: string
 *                   bio:
 *                     type: string
 *                   date_of_birth:
 *                     type: string
 *                   interests:
 *                     type: string
 *                   latitude:
 *                     type: number
 *                   longitude:
 *                     type: number
 *                   education:
 *                     type: string
 *                   profile_pic_url:
 *                     type: string
 *                   avatar_url:
 *                     type: string
 *                   profile_images:
 *                     type: string
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
//searching based on filter, filters to be passed as parameters //Mat
app.get("/users/getUsers", authenticateToken, async (req, res) => {
  const { id, latitude, longitude, gender, ageRange, interests, radRange } =
    req.query;

  // Start with a base query
  let query = `
    SELECT * FROM users 
    WHERE id != ? 
    AND id NOT IN (
      SELECT receiver_id FROM request WHERE sender_id = ? AND status = 'accepted'
      UNION
      SELECT sender_id FROM request WHERE receiver_id = ? AND status = 'accepted'
      UNION
      SELECT receiver_id FROM request WHERE sender_id = ? AND status = 'rejected'
      UNION
      SELECT sender_id FROM request WHERE receiver_id = ? AND status = 'rejected'
      UNION
      SELECT skipped_user_id FROM skip WHERE user_id = ?
    )
  `;
  let queryParams = [id, id, id, id, id, id, id];

  // Handle gender filter
  if (gender) {
    console.log("Gender was passed");
    const genderArr = gender.split(",");
    query += " AND (" + genderArr.map(() => "gender LIKE ?").join(" OR ") + ")";
    queryParams = queryParams.concat(genderArr.map((g) => `%${g}%`));
  }

  // Handle age range filter
  if (ageRange) {
    const [minAge, maxAge] = ageRange.split("-").map(Number);
    const minDob = new Date(
      new Date().setFullYear(new Date().getFullYear() - maxAge)
    );
    const maxDob = new Date(
      new Date().setFullYear(new Date().getFullYear() - minAge)
    );
    query += " AND date_of_birth BETWEEN ? AND ?";
    queryParams.push(
      minDob.toISOString().split("T")[0],
      maxDob.toISOString().split("T")[0]
    );
  }

  // Handle interests filter
  if (interests) {
    const interestsArray = interests.split(",");
    query +=
      " AND (" + interestsArray.map(() => "likes LIKE ?").join(" OR ") + ")";
    queryParams = queryParams.concat(
      interestsArray.map((interest) => `%${interest}%`)
    );
  }

  // Execute the query
  console.log(query);

  db.query(query, queryParams, (err, rows) => {
    if (err) {
      return res.status(500).send(err.message);
    }

    // If latitude, longitude, and radRange are provided, filter by distance range
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);

      if (radRange) {
        const [minRange, maxRange] = radRange.split("-").map(parseFloat);
        rows = rows.filter((user) => {
          const distance = calculateDistance(
            lat,
            lon,
            user.latitude,
            user.longitude
          );
          return distance >= minRange && distance <= maxRange;
        });
      } else {
        let minRange = 0;
        let maxRange = 1000;

        rows = rows.filter((user) => {
          const distance = calculateDistance(
            lat,
            lon,
            user.latitude,
            user.longitude
          );
          console.log(distance);
          return distance >= minRange && distance <= maxRange;
        });
      }
    }

    res.status(200).json(rows);
  });
});

// app.post(req, res);

/**
 * @swagger
 * /users/allRequests:
 *   get:
 *     summary: Get all requests
 *     tags: [Requests]
 *     description: Retrieve all requests from the database.
 *     responses:
 *       200:
 *         description: A list of requests fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   description: Indicates if the request was successful.
 *                 message:
 *                   type: string
 *                   description: Message related to the status of the request.
 *                 requests:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         description: The ID of the request.
 *                       senderID:
 *                         type: string
 *                         description: The ID of the sender.
 *                       receiverID:
 *                         type: string
 *                         description: The ID of the receiver.
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         description: The timestamp when the request was created.
 *     security:
 *       - apiKeyAuth: []
 */

//This is the get all Requests API
app.get("/users/allRequests", authenticateToken, async (req, res) => {
  db.query("SELECT * FROM request", (err, result) => {
    if (err) {
      return res
        .status(500)
        .json({ status: false, message: err.message, requests: null });
    }

    let requests = result.map((myRequest) => {
      return myRequest;
    });

    res.status(200).json({
      status: true,
      message: "Requests fetched successfully",
      requests,
    });
  });
});

/**
 * @swagger
 * /users/getRequests:
 *   get:
 *     summary: Get requests for a user
 *     description: Retrieve requests for a specific user based on receiver ID and status.
 *     tags: [Requests]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Receiver ID to filter requests.
 *     responses:
 *       200:
 *         description: A list of requests fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   description: Indicates if the request was successful.
 *                 message:
 *                   type: string
 *                   description: Message related to the status of the request.
 *                 requests:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         description: The ID of the request.
 *                       senderID:
 *                         type: string
 *                         description: The ID of the sender.
 *                       receiverID:
 *                         type: string
 *                         description: The ID of the receiver.
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         description: The timestamp when the request was created.
 *     security:
 *       - apiKeyAuth: []
 */
//This is the get Request API for a user
app.get("/users/getRequests", authenticateToken, async (req, res) => {
  const { id } = req.query;

  let query = "SELECT * FROM request WHERE receiver_id = ? ";
  let queryParams = [id];

  query += " AND status = ? ";
  queryParams.push("pending");

  db.query(query, queryParams, (err, result) => {
    if (err) {
      return res
        .status(500)
        .json({ status: false, message: err.message, requests: null });
    }

    let requests = result.map((myRequest) => {
      return myRequest;
    });

    res.status(200).json({
      status: true,
      message: "Requests fetched successfully",
      requests,
    });
  });
});
/**
 * @swagger
 * /users/getFriendList:
 *   get:
 *     summary: Get the friend list of a user
 *     description: Fetches the list of friends (user entities) for a given user based on their user ID. Only accepted friend requests are included in the list.
 *     tags: [Requests]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         description: The ID of the user whose friend list is to be fetched
 *         schema:
 *           type: string
 *           example: 123
 *     responses:
 *       200:
 *         description: Successfully fetched the friend list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Friend List fetched successfully
 *                 list:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: 456
 *                       name:
 *                         type: string
 *                         example: John Doe
 *                       email:
 *                         type: string
 *                         example: john.doe@example.com
 *                       contact:
 *                         type: string
 *                         example: 1234567890
 *                       gender:
 *                         type: string
 *                         example: male
 *                       dob:
 *                         type: string
 *                         example: 1990-01-01
 *                       bio:
 *                         type: string
 *                         example: "Hello, I'm John!"
 *                       interests:
 *                         type: string
 *                         example: "Reading, Traveling"
 *       400:
 *         description: Missing or invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Missing or invalid parameters
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: An error occurred while fetching the friend list
 */

//Get Friend Lists
app.get("/users/getFriendList", authenticateToken, async (req, res) => {
  const { id } = req.query;

  let query = `
    SELECT DISTINCT u.*
    FROM request r
    JOIN users u ON (r.sender_id = u.id AND r.receiver_id = ?) OR (r.receiver_id = u.id AND r.sender_id = ?)
    WHERE r.status = ?
  `;
  let queryParams = [id, id, "accepted"];

  db.query(query, queryParams, (err, result) => {
    if (err) {
      return res
        .status(500)
        .json({ status: false, message: err.message, list: null });
    }

    let requests = result.map((myRequest) => {
      myRequest.latitude = parseFloat(myRequest.latitude);
      myRequest.longitude = parseFloat(myRequest.longitude);

      return myRequest;
    });

    res.status(200).json({
      status: true,
      message: "Friend List fetched successfully",
      list: requests,
    });
  });
});

// POST APIs
/**
 * @swagger
 * /users/signup:
 *   post:
 *     summary: Sign up a new user
 *     tags: [Users]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               contact:
 *                 type: string
 *               gender:
 *                 type: string
 *               bio:
 *                 type: string
 *               dob:
 *                 type: string
 *               interests:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               education:
 *                 type: string
 *               profile_pic:
 *                 type: string
 *                 format: binary
 *               avatar_image:
 *                 type: string
 *                 format: binary
 *               profile_images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               document_url:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: User signed up successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
app.post(
  "/users/signup",
  upload.fields([
    { name: "profile_pic", maxCount: 1 },
    { name: "avatar_image", maxCount: 1 },
    { name: "profile_images", maxCount: 10 },
    { name: "document_url", maxCount: 1 },
  ]),
  validateSignup,
  async (req, res) => {
    const {
      name,
      contact,
      gender,
      bio,
      dob,
      interests,
      latitude,
      longitude,
      education,
    } = req.body;
    const interestsList = interests.split(","); // Convert interests to an array

    try {
      const profilePicUrl = req.files.profile_pic
        ? await uploadToCloudinary(req.files.profile_pic[0], "profile_pics")
        : null;
      const avatarImageUrl = req.files.avatar_image
        ? await uploadToCloudinary(req.files.avatar_image[0], "avatar_images")
        : null;
      const documentURl = req.files.document_url
        ? await uploadToCloudinary(req.files.document_url[0], "document_urls")
        : null;

      const profileImageUrls = req.files.profile_images
        ? await Promise.all(
            req.files.profile_images.map((file) =>
              uploadToCloudinary(file, "profile_images")
            )
          )
        : [];

      const user = {
        full_name: name,
        contact: contact,
        gender: gender,
        bio: bio,
        date_of_birth: dob,
        likes: JSON.stringify(interestsList),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        profile_pic_url: profilePicUrl,
        avatar_url: avatarImageUrl,
        profile_images: JSON.stringify(profileImageUrls),
        document_url: documentURl,
        education: education,
        status: "ACTIVE",
        subscribed: false,
        subscription_expiry: null,
      };

      db.query("INSERT INTO users SET ?", user, (err, result) => {
        if (err) {
          return res
            .status(500)
            .json({ status: false, message: err.message, user: null });
        }

        const token = jwt.sign(
          { contact: contact },
          process.env.JWT_SECRET_KEY
        );

        res.status(201).json({
          status: true,
          message: "User signed up successfully",
          user: {
            id: result.insertId,
            ...user,
            likes: interestsList, // Return interests as an array
            profile_images: profileImageUrls, // Return profile_images as an array
            token: token,
          },
        });
      });
    } catch (error) {
      res
        .status(500)
        .json({ status: false, message: error.message, user: null });
    }
  }
);

/**
 * @swagger
 * /users/sendRequest:
 *   post:
 *     summary: Send a request
 *     tags: [Requests]
 *     description: Create a new request with sender and receiver IDs.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               senderID:
 *                 type: string
 *                 description: The ID of the sender.
 *               receiverID:
 *                 type: string
 *                 description: The ID of the receiver.
 *     responses:
 *       201:
 *         description: Request sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   description: Indicates if the request was successfully sent.
 *                 message:
 *                   type: string
 *                   description: Message indicating the success of the request.
 *       500:
 *         description: Internal server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   description: Indicates if an error occurred.
 *                 message:
 *                   type: string
 *                   description: Error message describing the issue.
 *                 sendingRequest:
 *                   type: object
 *                   description: The request object that failed to send.
 *     security:
 *       - apiKeyAuth: []
 */

//This is the send Request API
app.post(
  "/users/sendRequest",
  upload.none(),
  authenticateToken,
  async (req, res) => {
    const { senderID, receiverID } = req.body;

    const sendingRequest = {
      sender_id: senderID,
      receiver_id: receiverID,
      status: "pending",
    };

    db.query("INSERT INTO request SET ?", sendingRequest, (err, result) => {
      if (err) {
        return res
          .status(500)
          .json({ status: false, message: err.message, sendingRequest: null });
      }
      res.status(201).json({
        status: true,
        message: "Request sent Successfully",
      });
    });
  }
);

// PUT APIs
/**
 * @swagger
 * /users/editUser/{id}:
 *   put:
 *     summary: Edit user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: The user ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               contact:
 *                 type: string
 *               gender:
 *                 type: string
 *               bio:
 *                 type: string
 *               dob:
 *                 type: string
 *               interests:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               education:
 *                 type: string
 *     responses:
 *       200:
 *         description: User edited successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */

app.put(
  "/users/editUser/:id",
  upload.fields([
    { name: "profile_pic", maxCount: 1 },
    { name: "avatar_image", maxCount: 1 },
    { name: "profile_images", maxCount: 10 },
  ]),
  authenticateToken,
  async (req, res) => {
    const id = req.params.id;
    const {
      name,
      contact,
      gender,
      bio,
      dob,
      interests,
      latitude,
      longitude,
      education,
    } = req.body;
    const interestsList = interests ? interests.split(",") : []; // Convert interests to an array

    // Collect the fields to update
    let updates = [];
    let queryParams = [];

    if (name) {
      updates.push("full_name = ?");
      queryParams.push(name);
    }
    if (contact) {
      updates.push("contact = ?");
      queryParams.push(contact);
    }
    if (dob) {
      updates.push("date_of_birth = ?");
      queryParams.push(dob);
    }
    if (bio) {
      updates.push("bio = ?");
      queryParams.push(bio);
    }
    if (gender) {
      updates.push("gender = ?");
      queryParams.push(gender);
    }
    if (education) {
      updates.push("education = ?");
      queryParams.push(education);
    }
    if (interests) {
      updates.push("likes = ?");
      queryParams.push(interestsList.join(",")); // Convert back to string for storage
    }
    if (longitude) {
      updates.push("longitude = ?");
      queryParams.push(longitude);
    }
    if (latitude) {
      updates.push("latitude = ?");
      queryParams.push(latitude);
    }

    if (
      req.files &&
      req.files["profile_pic"] &&
      req.files["profile_pic"].length > 0
    ) {
      const profilePicUrl = await uploadToCloudinary(
        req.files.profile_pic[0],
        "profile_pics"
      );
      updates.push("profile_pic_url = ?");
      queryParams.push(profilePicUrl);
    }

    if (
      req.files &&
      req.files["avatar_image"] &&
      req.files["avatar_image"].length > 0
    ) {
      const avatarImageUrl = await uploadToCloudinary(
        req.files.avatar_image[0],
        "avatar_images"
      );
      updates.push("avatar_url = ?");
      queryParams.push(avatarImageUrl);
    }

    if (
      req.files &&
      req.files["profile_images"] &&
      req.files["profile_images"].length > 0
    ) {
      const profileImageUrls = await Promise.all(
        req.files.profile_images.map((file) =>
          uploadToCloudinary(file, "profile_images")
        )
      );

      updates.push("profile_images = ?");
      queryParams.push(JSON.stringify(profileImageUrls)); // Store as JSON string
    }

    // If there are no fields to update, return a specific message
    if (updates.length === 0) {
      return res
        .status(200)
        .json({ status: false, message: "Nothing to update" });
    }

    const query = `UPDATE users SET ${updates.join(", ")} WHERE id = ?`;
    queryParams.push(id);

    // Execute the query
    db.query(query, queryParams, function (err, result) {
      if (err) {
        return res.status(500).send(err.message);
      }

      // Check if any rows were affected
      if (result.affectedRows === 0) {
        return res.status(404).send("User not found");
      }

      // Fetch and return the updated user entity
      db.query("SELECT * FROM users WHERE id = ?", [id], (err, rows) => {
        if (err) {
          return res.status(500).json({ status: false, error: err.message });
        }

        let retUser = rows[0];

        retUser.longitude = parseFloat(retUser.longitude);
        retUser.latitude = parseFloat(retUser.latitude);
        res.status(200).json({ status: true, user: retUser });
      });
    });
  }
);

/**
 * @swagger
 * /users/acceptRequest:
 *   put:
 *     summary: Accept a friend request
 *     description: Accepts a friend request by updating the status to 'accepted' for the specified sender and receiver IDs.
 *     tags: [Requests]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               receiverID:
 *                 type: string
 *                 description: The ID of the user receiving the friend request
 *                 example: 789
 *               senderID:
 *                 type: string
 *                 description: The ID of the user sending the friend request
 *                 example: 456
 *     responses:
 *       200:
 *         description: Successfully accepted the friend request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Request Accepted Successfully
 *       400:
 *         description: Missing or invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Missing or invalid parameters
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: An error occurred while accepting the request
 */

//This is the accept Request API for a user
app.put(
  "/users/acceptRequest",
  upload.none(),
  authenticateToken,
  async (req, res) => {
    const { receiverID, senderID } = req.body;

    const updates = ["status = ?"];
    const queryParams = ["accepted"];

    const query = `UPDATE request SET ${updates.join(
      ", "
    )} WHERE sender_id = ?`;
    queryParams.push(senderID);

    query.concat(" AND receiver_id = ?");
    queryParams.push(receiverID);

    // let query='SELECT * FROM request WHERE receiver_id = ? ';
    // let queryParams=[id];

    db.query(query, queryParams, (err, result) => {
      if (err) {
        return res.status(500).send(err.message);
      }

      // Check if any rows were affected
      if (result.affectedRows === 0) {
        return res.status(404).send("User not found");
      }

      res
        .status(200)
        .json({ status: true, message: "Request Accepted Successfully" });
    });
  }
);

/**
 * @swagger
 * /users/rejectRequest:
 *   put:
 *     summary: Reject a friend request
 *     description: Rejects a friend request by updating the status to 'accepted' for the specified sender and receiver IDs.
 *     tags: [Requests]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               receiverID:
 *                 type: string
 *                 description: The ID of the user receiving the friend request
 *                 example: 789
 *               senderID:
 *                 type: string
 *                 description: The ID of the user sending the friend request
 *                 example: 456
 *     responses:
 *       200:
 *         description: Successfully rejected the friend request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Request Rejected Successfully
 *       400:
 *         description: Missing or invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Missing or invalid parameters
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: An error occurred while accepting the request
 */

//This is the reject Request API for a user
app.put(
  "/users/rejectRequest",
  upload.none(),
  authenticateToken,
  async (req, res) => {
    const { receiverID, senderID } = req.body;

    const updates = ["status = ?"];
    const queryParams = ["rejected"];

    const query = `UPDATE request SET ${updates.join(
      ", "
    )} WHERE sender_id = ?`;
    queryParams.push(senderID);

    query.concat(" AND receiver_id = ?");
    queryParams.push(receiverID);

    // let query='SELECT * FROM request WHERE receiver_id = ? ';
    // let queryParams=[id];

    db.query(query, queryParams, (err, result) => {
      if (err) {
        return res.status(500).send(err.message);
      }

      // Check if any rows were affected
      if (result.affectedRows === 0) {
        return res.status(404).send("User not found");
      }

      res
        .status(200)
        .json({ status: true, message: "Request Rejected Successfully" });
    });
  }
);

/**
 * @swagger
 * /users/removeFriend:
 *   put:
 *     summary: Remove a friend
 *     description: Removes a friend by updating the status to 'rejected' for the specified sender and receiver IDs.
 *     tags: [Requests]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         description: The ID of the user who is removing the friend
 *         schema:
 *           type: string
 *           example: 123
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               friendID:
 *                 type: string
 *                 description: The ID of the friend being removed
 *                 example: 456
 *     responses:
 *       200:
 *         description: Successfully removed the friend
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Friend Removed Successfully
 *       404:
 *         description: User not found
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: User not found
 *       500:
 *         description: Internal server error
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Internal Server Error
 */

//API for removing friend
app.put(
  "/users/removeFriend",
  upload.none(),
  authenticateToken,
  async (req, res) => {
    const { id } = req.query;
    const { friendID } = req.body;

    console.log(friendID);

    const updates = ["status = ?"];
    let queryParams = ["rejected"];

    const query = `UPDATE request SET ${updates.join(
      ", "
    )} WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)`;
    queryParams.push(friendID, id, id, friendID);

    query.concat(" AND status = ?");
    queryParams.push("accepted");

    db.query(query, queryParams, (err, result) => {
      if (err) {
        return res.status(500).send(err.message);
      }

      // Check if any rows were affected
      if (result.affectedRows === 0) {
        return res.status(404).send("User not found");
      }

      res
        .status(200)
        .json({ status: true, message: "Friend Removed Successfully" });
    });
  }
);

// DELETE APIs
/**
 * @swagger
 * /dropTable/{tableName}:
 *   delete:
 *     summary: Drop a specific table
 *     tags: [Database]
 *     parameters:
 *       - in: path
 *         name: tableName
 *         schema:
 *           type: string
 *         required: true
 *         description: The name of the table to drop
 *     responses:
 *       200:
 *         description: Table dropped successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
/**
 * @swagger
 * /dropTable:
 *   delete:
 *     summary: Drop all tables
 *     tags: [Database]
 *     responses:
 *       200:
 *         description: All tables dropped successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
app.delete("/dropTable/:tableName?", (req, res) => {
  const { tableName } = req.params;

  if (tableName) {
    // Drop a specific table
    const dropTableQuery = `DROP TABLE IF EXISTS \`${tableName}\``;

    db.query(dropTableQuery, (err, result) => {
      if (err) {
        if (
          err.code === "ER_ROW_IS_REFERENCED_2" ||
          err.code === "ER_ROW_IS_REFERENCED"
        ) {
          return res.status(400).json({
            status: false,
            message: `Cannot drop table '${tableName}' referenced by a foreign key constraint.`,
          });
        }
        return res.status(500).json({ status: false, message: err.message });
      }
      res.status(200).json({
        status: true,
        message: `Table ${tableName} dropped successfully`,
      });
    });
  } else {
    // Drop all tables
    const getAllTablesQuery = `SHOW TABLES`;

    db.query(getAllTablesQuery, (err, tables) => {
      if (err) {
        return res.status(500).json({ status: false, message: err.message });
      }

      const dropTablePromises = tables.map((table) => {
        const tableName = table[`Tables_in_${db.config.database}`];
        const dropTableQuery = `DROP TABLE IF EXISTS \`${tableName}\``;

        return new Promise((resolve, reject) => {
          db.query(dropTableQuery, (err, result) => {
            if (err) {
              if (
                err.code === "ER_ROW_IS_REFERENCED_2" ||
                err.code === "ER_ROW_IS_REFERENCED"
              ) {
                resolve(
                  `Cannot drop table '${tableName}' referenced by a foreign key constraint.`
                );
              } else {
                reject(err);
              }
            } else {
              resolve(`Table ${tableName} dropped successfully`);
            }
          });
        });
      });

      Promise.all(dropTablePromises)
        .then((messages) =>
          res.status(200).json({ status: true, message: messages.join(", ") })
        )
        .catch((err) =>
          res.status(500).json({ status: false, message: err.message })
        );
    });
  }
});

/**
 * @swagger
 * /deleteAllData/{tableName}:
 *   delete:
 *     summary: Delete all data from a table
 *     tags: [Database]
 *     parameters:
 *       - in: path
 *         name: tableName
 *         schema:
 *           type: string
 *         required: true
 *         description: The table name
 *     responses:
 *       200:
 *         description: All data from table deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
app.delete("/deleteAllData/:tableName", (req, res) => {
  const { tableName } = req.params;
  const deleteAllDataQuery = `DELETE FROM \`${tableName}\``;

  db.query(deleteAllDataQuery, (err, result) => {
    if (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
    res.status(200).json({
      status: true,
      message: `All data from table ${tableName} deleted successfully`,
    });
  });
});

/**
 * @swagger
 * /users/removeUser:
 *   put:
 *     summary: Remove a user
 *     description: Removes a user by updating their status to 'NON_ACTIVE' for the specified user ID.
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         description: The ID of the user to be removed
 *         schema:
 *           type: string
 *           example: 123
 *     responses:
 *       200:
 *         description: Successfully removed the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User Removed Successfully
 *       404:
 *         description: User not found
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: User not found
 *       500:
 *         description: Internal server error
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Internal Server Error
 */

//API for removing friend
app.put("/users/removeUser", authenticateToken, async (req, res) => {
  const { id } = req.query;

  const updates = ["status = ?"];
  let queryParams = ["NON_ACTIVE"];

  const query = `UPDATE users SET ${updates.join(", ")} WHERE id = ?`;
  queryParams.push(id);

  db.query(query, queryParams, (err, result) => {
    if (err) {
      return res.status(500).send(err.message);
    }

    // Check if any rows were affected
    if (result.affectedRows === 0) {
      return res.status(404).send("User not found");
    }

    res
      .status(200)
      .json({ status: true, message: "User Removed Successfully" });
  });
});

// app.post("/users/matchUser", upload.none(), (req, res) => {
//   const { user_id, matched_user_id } = req.body;
//   console.log("user_id:", user_id, "matched user id: ", matched_user_id);

//   if (!user_id || !matched_user_id) {
//     return res
//       .status(400)
//       .json({ message: "Both user_id and matched_user_id are required" });
//   }

//   const query = "INSERT INTO matches (user_id, matched_user_id) VALUES (?, ?)";
//   const values = [user_id, matched_user_id];

//   db.query(query, values, (error, results) => {
//     if (error) {
//       console.error("Error inserting match: ", error);
//       return res.status(500).json({ message: "Failed to create match" });
//     }
//     res.status(201).json({
//       message: "Match created successfully",
//     });
//   });
// });

app.put("/users/setOnlineStatus", async (req, res) => {
  const { id, flag } = req.body;
  const query = `UPDATE users SET online_status = ? WHERE id = ?`;
  const queryParams = [flag, id];
  db.query(query, queryParams, (err, result) => {
    if (err) {
      return res.status(500).send(err.message);
    }
    if (result.affectedRows === 0) {
      return res.status(404).send("User not found");
    }
    res
      .status(500)
      .json({ status: true, message: `Status Set to ${flag} Successfully` });
  });
});

/**
 * @swagger
 * /users/skipUser:
 *   post:
 *     summary: Skip a user
 *     description: Adds a user to the skip list, indicating that the current user has skipped this user.
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - skipped_user_id
 *             properties:
 *               user_id:
 *                 type: integer
 *                 description: The ID of the user who is skipping another user
 *                 example: 1
 *               skipped_user_id:
 *                 type: integer
 *                 description: The ID of the user being skipped
 *                 example: 2
 *     responses:
 *       201:
 *         description: User skipped successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "true"
 *                 message:
 *                   type: string
 *                   example: "User skipped successfully"
 *       400:
 *         description: Bad request. Missing required parameters.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Both user_id and skipped_user_id are required"
 *       500:
 *         description: Internal server error. Failed to skip user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to skip user {error.message}"
 */

app.post(
  "/users/skipUser",
  upload.none(),
  authenticateToken,
  async (req, res) => {
    const { user_id, skipped_user_id } = req.body;
    console.log("user_id", skipped_user_id);

    if (!user_id || !skipped_user_id) {
      return res
        .status(400)
        .json({ message: "Both user_id and skipped_user_id are required" });
    }

    const query = "INSERT INTO skip (user_id, skipped_user_id) VALUES (?, ?)";
    const values = [user_id, skipped_user_id];

    db.query(query, values, (error, results) => {
      if (error) {
        console.error("Error inserting skip record: ", error);
        return res
          .status(500)
          .json({ message: `Failed to skip user ${error.message}` });
      }
      res.status(201).json({
        status: "true",
        message: "User skipped successfully",
      });
    });
  }
);

/**
 * @swagger
 * /users/addPayment:
 *   post:
 *     summary: Add a payment record and update the user's subscription status.
 *     tags:
 *       - Users
 *     description: This endpoint allows you to add a payment record for a user and update their subscription status.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - date
 *               - reason
 *             properties:
 *               user_id:
 *                 type: integer
 *                 description: The ID of the user.
 *                 example: 1
 *               date:
 *                 type: string
 *                 format: date-time
 *                 description: The date of the payment.
 *                 example: "2024-07-16T12:00:00Z"
 *               reason:
 *                 type: string
 *                 description: The reason for the payment.
 *                 example: "Subscription renewal"
 *     responses:
 *       201:
 *         description: Payment record added and user subscription updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "true"
 *                 message:
 *                   type: string
 *                   example: "Payment record added and user subscription updated successfully"
 *                 user:
 *                   type: object
 *                   description: The updated user entity.
 *                   properties:
 *                     id:
 *                       type: integer
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                     subscribed:
 *                       type: boolean
 *                     subscription_expiry:
 *                       type: string
 *                       format: date
 *                 paymentRecord:
 *                   type: object
 *                   description: The payment record that was added.
 *                   properties:
 *                     id:
 *                       type: integer
 *                     user_id:
 *                       type: integer
 *                     date:
 *                       type: string
 *                       format: date-time
 *                     reason:
 *                       type: string
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Please provide all the attributes: user_id, date, reason"
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User not found"
 *       500:
 *         description: Internal Server Error. Failed to add payment record or update user subscription.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to add payment record: error message"
 */

app.post("/users/addPayment", upload.none(), authenticateToken, (req, res) => {
  const { user_id, date, reason } = req.body;

  if (!user_id || !date || !reason) {
    return res.status(400).json({
      message: "Please provide all the attributes: user_id, date, reason",
    });
  }

  const parsedDate = new Date(date);
  if (isNaN(parsedDate)) {
    return res.status(400).json({
      message: "Invalid date format",
    });
  }
  const formattedDate = parsedDate.toISOString().slice(0, 19).replace("T", " ");

  const subscriptionExpiryDate = addOneMonth(parsedDate)
    .toISOString()
    .slice(0, 10);

  const insertPaymentQuery =
    "INSERT INTO payment_history (user_id, date, reason) VALUES (?, ?, ?)";
  const insertPaymentValues = [user_id, formattedDate, reason];

  db.query(insertPaymentQuery, insertPaymentValues, (error, paymentResults) => {
    if (error) {
      console.error("Error inserting payment record:", error);
      return res.status(500).json({
        message: `Failed to add payment record: ${error.message}`,
      });
    }

    // Update user subscription status
    const updateUserQuery =
      "UPDATE users SET subscribed = ?, subscription_expiry = ? WHERE id = ?";
    const updateUserValues = [true, subscriptionExpiryDate, user_id];

    db.query(updateUserQuery, updateUserValues, (error, updateResults) => {
      if (error) {
        console.error("Error updating user record:", error);
        return res.status(500).json({
          message: `Failed to update user subscription: ${error.message}`,
        });
      }

      // Fetch the updated user data
      const fetchUserQuery = "SELECT * FROM users WHERE id = ?";
      db.query(fetchUserQuery, [user_id], (error, userResults) => {
        if (error) {
          console.error("Error fetching user data:", error);
          return res.status(500).json({
            message: `Failed to fetch user data: ${error.message}`,
          });
        }

        if (userResults.length === 0) {
          return res.status(404).json({
            message: "User not found",
          });
        }

        const user = userResults[0];
        const paymentRecord = {
          id: paymentResults.insertId,
          user_id,
          date: formattedDate,
          reason,
        };

        res.status(201).json({
          status: "true",
          message:
            "Payment record added and user subscription updated successfully",
          user,
          paymentRecord,
        });
      });
    });
  });
});

function addOneMonth(date) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  return result;
}
