require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');

const { specs, swaggerUi } = require('./config/swagger');

const db = require('./config/dbConnection');
const setupQueries = require('./components/queries');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// APP SETUP
const port = 3000;
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve Swagger UI
app.use('/api-docs', express.static('node-modules/swagger-ui-dist/',
  { index: false }), swaggerUi.serve, swaggerUi.setup(specs));

// DB Connection
db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL');

  db.query(setupQueries, (err, results) => {
    if (err) {
      console.error('Error setting up database:', err);
      return;
    }
    console.log('Database setup complete');
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  });
});

// Helper functions
const { calculateDistance, uploadToCloudinary, validateSignup } = require('./utils');

// Message handling
io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('sendMessage', (data) => {
    const { app_id, from, to, message } = data;
    const query = 'INSERT INTO messages (app_id, from_user, to_user, message) VALUES (?, ?, ?, ?)';

    connection.query(query, [app_id, from, to, message], (err, results) => {
      if (err) {
        socket.emit('messageError', 'Error sending message');
        return;
      }
      io.emit('newMessage', data);
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
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
app.get('/get-messages', (req, res) => {
  const { app_id, user1, user2 } = req.query;
  const query = `
    SELECT * FROM messages 
    WHERE app_id = ? AND 
    ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))
    ORDER BY timestamp ASC
  `;

  connection.query(query, [app_id, user1, user2, user2, user1], (err, results) => {
    if (err) {
      return res.status(500).send('Error retrieving messages');
    }
    res.json(results);
  });
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
app.get('/users', (req, res) => {
  db.query('SELECT * FROM users', (err, result) => {
    if (err) {
      return res.status(500).json({ status: false, message: err.message, users: null });
    }

    let users = result.map(user => {
      user.longitude = parseFloat(user.longitude);
      user.latitude = parseFloat(user.latitude);
      return user;
    });

    res.status(200).json({ status: true, message: 'Users fetched successfully', users });
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
app.get('/users/id/:id', (req, res) => {
  const { id } = req.params;

  db.query('SELECT * FROM users WHERE id = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).json({ status: false, message: err.message, user: null });
    }
    if (result.length === 0) {
      return res.status(404).json({ status: false, message: 'User not found', user: null });
    }

    const user = result[0];

    res.status(200).json({ status: true, message: 'User fetched successfully', user });
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
app.get('/users/exists/:contact', (req, res) => {
  const { contact } = req.params;

  db.query('SELECT * FROM users WHERE contact = ?', [contact], (err, result) => {
    if (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
    if (result.length === 0) {
      return res.status(404).json({ status: false, message: 'User does not exist', user: null });
    }

    let user = result[0];

    user.longitude = parseFloat(user.longitude);
    user.latitude = parseFloat(user.latitude);

    res.status(200).json({ status: true, message: 'User exists', user });
  });
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
app.get('/', (req, res) => {
  res.send('Hello, world!');
});

//searching based on filter, filters to be passed as parameters
app.get('/users/getUsers', async (req, res) => {
  //const id = req.params.id;
  const { id, longitude, latitude, gender, ageRange, interests, radRange } = req?.query;

  console.log(gender);
  // Start with a base query
  let query = 'SELECT * FROM users WHERE id != ? ';
  let queryParams = [];
  queryParams.push(id);

  // Handle gender filter
  if (gender) {
    console.log('Gender was passed');
    const genderArr = gender.split(',');
    query += ' AND (' + genderArr.map(_ => 'gender LIKE ?').join(' OR ') + ')';
    queryParams = queryParams.concat(genderArr.map(gender => `%${gender}%`));
  }

  // Handle age range filter
  if (ageRange) {
    const [minAge, maxAge] = ageRange.split('-').map(Number);
    const minDob = new Date(new Date().setFullYear(new Date().getFullYear() - maxAge));
    const maxDob = new Date(new Date().setFullYear(new Date().getFullYear() - minAge));
    query += ' AND dob BETWEEN ? AND ?';
    queryParams.push(minDob.toISOString(), maxDob.toISOString());
  }

  // Handle interests filter
  if (interests) {
    const interestsArray = interests.split(',');
    query += ' AND (' + interestsArray.map(_ => 'likes LIKE ?').join(' OR ') + ')';
    queryParams = queryParams.concat(interestsArray.map(interest => `%${interest}%`));
  }

  // Execute the query
  console.log(query);

    db.query(query, queryParams, (err, rows) => {
    if (err) {
      return res.status(500).send(err.message);
    }

    // If latitude, longitude, and radRange are provided, filter by distance range
    if (latitude && longitude && radRange) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      const [minRange, maxRange] = radRange.split('-').map(parseFloat);

      rows = rows.filter(user => {
        const distance = calculateDistance(lat, lon, user.latitude, user.longitude);
        return distance >= minRange && distance <= maxRange;
      });
    }

    res.status(200).json(rows);
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
app.post('/users/signup', upload.fields([
  { name: 'profile_pic', maxCount: 1 },
  { name: 'avatar_image', maxCount: 1 },
  { name: 'profile_images', maxCount: 10 },
  { name: 'document_url', maxCount: 1 }
]), validateSignup, async (req, res) => {
  const { name, contact, gender, bio, dob, interests, latitude, longitude, education } = req.body;
  const interestsList = interests.split(','); // Convert interests to an array

  try {
    const profilePicUrl = req.files.profile_pic ? await uploadToCloudinary(req.files.profile_pic[0], 'profile_pics') : null;
    const avatarImageUrl = req.files.avatar_image ? await uploadToCloudinary(req.files.avatar_image[0], 'avatar_images') : null;
    const documentURl = req.files.document_url ? await uploadToCloudinary(req.files.document_url[0], 'document_urls') : null;

    const profileImageUrls = req.files.profile_images ? await Promise.all(
      req.files.profile_images.map(file => uploadToCloudinary(file, 'profile_images'))
    ) : [];

    const user = {
      full_name: name,
      contact: contact,
      gender: gender,
      bio: bio,
      date_of_birth: dob,
      likes: JSON.stringify(interestsList), // Save as a JSON string in the database
      latitude: parseFloat(latitude), // Convert latitude to float
      longitude: parseFloat(longitude), // Convert longitude to float
      profile_pic_url: profilePicUrl,
      avatar_url: avatarImageUrl,
      profile_images: JSON.stringify(profileImageUrls), // Save as a JSON string in the database
      document_url: documentURl,
      education: education,
      status: 'ACTIVE',
      subscribed: false,
      subscription_expiry: null
    };

    db.query('INSERT INTO users SET ?', user, (err, result) => {
      if (err) {
        return res.status(500).json({ status: false, message: err.message, user: null });
      }
      res.status(201).json({
        status: true,
        message: 'User signed up successfully',
        user: {
          id: result.insertId,
          ...user,
          likes: interestsList, // Return interests as an array
          profile_images: profileImageUrls // Return profile_images as an array
        }
      });
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message, user: null });
  }
});


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

app.put('/users/editUser/:id', upload.fields([
  { name: 'profile_pic', maxCount: 1 },
  { name: 'avatar_image', maxCount: 1 },
  { name: 'profile_images', maxCount: 10 }
]), async (req, res) => {

  const id = req.params.id;
  const { name, contact, gender, bio, dob, interests, latitude, longitude, education } = req.body;
  const interestsList = interests ? interests.split(',') : []; // Convert interests to an array

  // Collect the fields to update
  let updates = [];
  let queryParams = [];

  if (name) {
    updates.push('full_name = ?');
    queryParams.push(name);
  }
  if (contact) {
    updates.push('contact = ?');
    queryParams.push(contact);
  }
  if (dob) {
    updates.push('date_of_birth = ?');
    queryParams.push(dob);
  }
  if (bio) {
    updates.push('bio = ?');
    queryParams.push(bio);
  }
  if (gender) {
    updates.push('gender = ?');
    queryParams.push(gender);
  }
  if (education) {
    updates.push('education = ?');
    queryParams.push(education);
  }
  if (interests) {
    updates.push('likes = ?');
    queryParams.push(interestsList.join(',')); // Convert back to string for storage
  }
  if (longitude) {
    updates.push('longitude = ?');
    queryParams.push(longitude);
  }
  if (latitude) {
    updates.push('latitude = ?');
    queryParams.push(latitude);
  }

  if (req.files && req.files['profile_pic'] && req.files['profile_pic'].length > 0) {
    const profilePicUrl = await uploadToCloudinary(req.files.profile_pic[0], 'profile_pics');
    updates.push('profile_pic_url = ?');
    queryParams.push(profilePicUrl);
  }

  if (req.files && req.files['avatar_image'] && req.files['avatar_image'].length > 0) {
    const avatarImageUrl = await uploadToCloudinary(req.files.avatar_image[0], 'avatar_images');
    updates.push('avatar_url = ?');
    queryParams.push(avatarImageUrl);
  }

  if (req.files && req.files['profile_images'] && req.files['profile_images'].length > 0) {
    const profileImageUrls = await Promise.all(
      req.files.profile_images.map(file => uploadToCloudinary(file, 'profile_images'))
    );

    updates.push('profile_images = ?');
    queryParams.push(JSON.stringify(profileImageUrls)); // Store as JSON string
  }

  // If there are no fields to update, return a specific message
  if (updates.length === 0) {
    return res.status(200).json({ status: false, message: 'Nothing to update' });
  }

  const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
  queryParams.push(id);

  // Execute the query
  db.query(query, queryParams, function (err, result) {
    if (err) {
      return res.status(500).send(err.message);
    }

    // Check if any rows were affected
    if (result.affectedRows === 0) {
      return res.status(404).send('User not found');
    }

    // Fetch and return the updated user entity
    db.query('SELECT * FROM users WHERE id = ?', [id], (err, rows) => {
      if (err) {
        return res.status(500).send(err.message);
      }
      res.status(200).json(rows[0]);
    });
  });
});


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
app.delete('/dropTable/:tableName?', (req, res) => {
  const { tableName } = req.params;

  if (tableName) {
    // Drop a specific table
    const dropTableQuery = `DROP TABLE IF EXISTS \`${tableName}\``;

    db.query(dropTableQuery, (err, result) => {
      if (err) {
        if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
          return res.status(400).json({ status: false, message: `Cannot drop table '${tableName}' referenced by a foreign key constraint.` });
        }
        return res.status(500).json({ status: false, message: err.message });
      }
      res.status(200).json({ status: true, message: `Table ${tableName} dropped successfully` });
    });
  } else {
    // Drop all tables
    const getAllTablesQuery = `SHOW TABLES`;

    db.query(getAllTablesQuery, (err, tables) => {
      if (err) {
        return res.status(500).json({ status: false, message: err.message });
      }

      const dropTablePromises = tables.map(table => {
        const tableName = table[`Tables_in_${db.config.database}`];
        const dropTableQuery = `DROP TABLE IF EXISTS \`${tableName}\``;

        return new Promise((resolve, reject) => {
          db.query(dropTableQuery, (err, result) => {
            if (err) {
              if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
                resolve(`Cannot drop table '${tableName}' referenced by a foreign key constraint.`);
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
        .then(messages => res.status(200).json({ status: true, message: messages.join(', ') }))
        .catch(err => res.status(500).json({ status: false, message: err.message }));
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
app.delete('/deleteAllData/:tableName', (req, res) => {
  const { tableName } = req.params;
  const deleteAllDataQuery = `DELETE FROM \`${tableName}\``;

  db.query(deleteAllDataQuery, (err, result) => {
    if (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
    res.status(200).json({ status: true, message: `All data from table ${tableName} deleted successfully` });
  });
});
