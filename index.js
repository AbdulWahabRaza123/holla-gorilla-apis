//----------------------All Imports--------------------
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');

const cloudinary = require('./config/cloudinaryConfig');
const db = require('./config/dbConnection');
const setupQueries = require('./components/queries');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

//----------------APP SETUP-----------------
const port = 3000;
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

//-----------------DB Connection being made-----------------
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

//------------------------------HELPER FUNCTIONS-------------------------

// Haversine formula to calculate distance between two points in KM
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180; // Convert degrees to radians
  const dLon = (lon2 - lon1) * Math.PI / 180; // Convert degrees to radians
  const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

// Helper function to upload files to Cloudinary
const uploadToCloudinary = (file, folder) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder: folder }, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result.secure_url);
      }
    }).end(file.buffer);
  });
};

// Middleware for validating signup request
const validateSignup = (req, res, next) => {
  const { name, contact, gender, bio, dob, interests, latitude, longitude, education } = req.body;
  if (!name) return res.status(400).json({ status: false, message: 'Name is required', user: null });
  if (!contact) return res.status(400).json({ status: false, message: 'Contact is required', user: null });
  if (!gender) return res.status(400).json({ status: false, message: 'Gender is required', user: null });
  if (!bio) return res.status(400).json({ status: false, message: 'Bio is required', user: null });
  if (!dob) return res.status(400).json({ status: false, message: 'Date of Birth is required', user: null });
  if (!interests) return res.status(400).json({ status: false, message: 'Interests are required', user: null });
  if (!latitude) return res.status(400).json({ status: false, message: 'Latitude is required', user: null });
  if (!longitude) return res.status(400).json({ status: false, message: 'Longitude is required', user: null });
  if (!education) return res.status(400).json({ status: false, message: 'Education is required', user: null });
  next();
};

//---------------------Message handling-----------------
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

//----------------------------All Implemented APIs--------------------------

//Get Messages API
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


//Users SignUp API
app.post('/users/signup', upload.fields([
    { name: 'profile_pic', maxCount: 1 },
    { name: 'avatar_image', maxCount: 1 },
    { name: 'profile_images', maxCount: 10 },
    { name: 'document_url', maxCount: 1 }
]), validateSignup, async (req, res) => {
  const { name, contact, gender, bio, dob, interests, latitude, longitude, education } = req.body;
  const interestsList = JSON.stringify(interests.split(','));

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
            likes: interestsList,
            latitude: latitude,
            longitude: longitude,
            profile_pic_url: profilePicUrl,
            avatar_url: avatarImageUrl,
            profile_images: JSON.stringify(profileImageUrls),
            document_url: documentURl,
            education: education,
            status: 'ACTIVE', // Default value
            subscribed: false, // Default value
            subscription_expiry: null // Default value
        };

        db.query('INSERT INTO users SET ?', user, (err, result) => {
            if (err) {
                return res.status(500).json({ status: false, message: err.message, user: null });
            }
            res.status(201).json({
                status: true,
                message: 'User signed up successfully',
                user: { id: result.insertId, ...user, profile_images: profileImageUrls }
            });
        });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message, user: null });
    }
});


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




// API to get all users
app.get('/users', (req, res) => {
  db.query('SELECT * FROM users', (err, result) => {
      if (err) {
          return res.status(500).json({ status: false, message: err.message, users: null });
      }

      const users = result.map(user => {
         
          return user;
      });

      res.status(200).json({ status: true, message: 'Users fetched successfully', users });
  });
});


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

app.get('/users/exists/:contact', (req, res) => {
  const { contact } = req.params;

  db.query('SELECT * FROM users WHERE contact = ?', [contact], (err, result) => {
      if (err) {
          return res.status(500).json({ status: false, message: err.message });
      }
      if (result.length === 0) {
          return res.status(404).json({ status: false, message: 'User does not exist', user: null });
      }

      const user = result[0];

  

      res.status(200).json({ status: true, message: 'User exists', user });
  });
});

// API to drop a table
app.delete('/dropTable/:tableName', (req, res) => {
    const { tableName } = req.params;
    const dropTableQuery = `DROP TABLE IF EXISTS \`${tableName}\``;

    db.query(dropTableQuery, (err, result) => {
        if (err) {
            return res.status(500).json({ status: false, message: err.message });
        }
        res.status(200).json({ status: true, message: `Table ${tableName} dropped successfully` });
    });
});

// API to delete all data from a table
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

app.get('/', (req, res) => {
  res.send('Hello, world!');
});
