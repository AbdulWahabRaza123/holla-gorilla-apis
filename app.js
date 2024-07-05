require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const http = require('http');
const socketIo = require('socket.io');
const multiparty = require('multiparty');
const storage = require('./storage');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);


const port = 3000;

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));



const connection = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
});


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

//helper function to convert date string to date time object
function convertToDateTime(dateStr) {
  // Append 'T00:00:00Z' to the date string to set the time to midnight
  const dateTimeStr = dateStr + 'T00:00:00Z';
  return new Date(dateTimeStr);
}


connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL');

  const setupQueries = `
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      app_id VARCHAR(255) NOT NULL,
      from_user VARCHAR(255) NOT NULL,
      to_user VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  connection.query(setupQueries, (err, results) => {
    if (err) {
      console.error('Error setting up database:', err);
      return;
    }
    console.log('Database setup complete');

    server.listen(3000, () => {
      console.log('Server is running on port 3000');
    });
  });
});

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



app.get('/', (req, res) => {
  res.send('Hello, world!');
});

//searching based on filter, filters to be passed as parameters
app.get('/users/search/:id', (req, res) => {
  const id = req.params.id;

  const { longitude, latitude, gender, ageRange, interests, radius } = req?.query;

  // Start with a base query
  let query = 'SELECT * FROM users WHERE id !=? ';
  let queryParams = [];
  queryParams.push(id);

  console.log(gender);
  if (gender) {
      const genderArr = gender.split(',');
      query += ' AND (' + genderArr.map(_ => 'gender LIKE ?').join(' OR ') + ')';
      queryParams = queryParams.concat(genderArr.map(gender => `%${gender}%`));
  }

  if (ageRange) {
      const [minAge, maxAge] = ageRange.split('-').map(Number);
      query += ' AND dob BETWEEN ? AND ?';
      const minDob = new Date(new Date().setFullYear(new Date().getFullYear() - maxAge));
      const maxDob = new Date(new Date().setFullYear(new Date().getFullYear() - minAge));
      queryParams.push(minDob.toISOString(), maxDob.toISOString());
  }

  if (interests) {
      const interestsArray = interests.split(',');
      query += ' AND (' + interestsArray.map(_ => 'interests LIKE ?').join(' OR ') + ')';
      queryParams = queryParams.concat(interestsArray.map(interest => `%${interest}%`));
  }

  db.all(query, queryParams, (err, rows) => {
      if (err) {
          return res.status(500).send(err.message);
      }

      // If latitude, longitude, and radius are provided, filter by distance
      if (latitude && longitude && radius) {
          const lat = parseFloat(latitude);
          const lon = parseFloat(longitude);
          const rad = parseFloat(radius);

          rows = rows.filter(user => {
              const distance = calculateDistance(lat, lon, user.latitude, user.longitude);
              return distance <= rad;
          });
      }

      res.status(200).json(rows);
  });


});


//get specific user based on id
app.get('/users/getSpecificUser/:id', (req, res) => {

  const id = req.params.id;
  db.all('SELECT * FROM users WHERE users.id == ? ', [id], (err, rows) => {
      if (err) {
          return res.status(500).send(err.message);
      }
      res.json(rows);
  });
});

//editing the user based on optional parameters
app.put('/users/editUser/:id', (req, res) => {
  const userId = req.params.id;
  // Handle multipart/form-data
  if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
      const form = new multiparty.Form();
      form.parse(req, (err, fields, files) => {
          if (err) {
              return res.status(400).send('Error parsing form data');
          }
          const { name, dob, bio, contact, gender, education } = fields;
          // Validate the user ID
          if (!userId) {
              return res.status(400).send('User ID is required');
          }
          // Collect the fields to update
          let updates = [];
          let queryParams = [];
          if (name) {
              updates.push('name = ?');
              queryParams.push(name[0]);
          }
          if (dob) {
              updates.push('dob = ?');
              queryParams.push(dob[0]);
          }
          if (bio) {
              updates.push('bio = ?');
              queryParams.push(bio[0]);
          }
          if (contact) {
              updates.push('contact = ?');
              queryParams.push(contact[0]);
          }
          if (gender) {
              updates.push('gender = ?');
              queryParams.push(gender[0]);
          }
          if (education) {
              updates.push('education = ?');
              queryParams.push(education[0]);
          }
          // If there are no fields to update, return an error
          if (updates.length === 0) {
              return res.status(400).send('No fields to update');
          }
          // Construct the SQL query
          const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
          queryParams.push(userId);
          // Execute the query
          db.run(query, queryParams, function (err) {
              if (err) {
                  return res.status(500).send(err.message);
              }
              // Check if any rows were affected
              if (this.changes === 0) {
                  return res.status(404).send('User not found');
              }
              res.status(200).send('User updated successfully');
          });
      });
  } else {
      // Handle application/json and application/x-www-form-urlencoded
      const { name, dob, bio, contact, gender, education } = req.body;
      // Validate the user ID
      if (!userId) {
          return res.status(400).send('User ID is required');
      }
      // Collect the fields to update
      let updates = [];
      let queryParams = [];
      if (name) {
          updates.push('name = ?');
          queryParams.push(name);
      }
      if (dob) {
          updates.push('dob = ?');
          queryParams.push(dob);
      }
      if (bio) {
          updates.push('bio = ?');
          queryParams.push(bio);
      }
      if (contact) {
          updates.push('contact = ?');
          queryParams.push(contact);
      }
      if (gender) {
          updates.push('gender = ?');
          queryParams.push(gender);
      }
      if (education) {
          updates.push('education = ?');
          queryParams.push(education);
      }
      // If there are no fields to update, return an error
      if (updates.length === 0) {
          return res.status(400).send('No fields to update');
      }
      // Construct the SQL query
      const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      queryParams.push(userId);
      // Execute the query
      db.run(query, queryParams, function (err) {
          if (err) {
              return res.status(500).send(err.message);
          }
          // Check if any rows were affected
          if (this.changes === 0) {
              return res.status(404).send('User not found');
          }
          res.status(200).send('User updated successfully');
      });
  }
});

//getting users based on provided radius
app.get('/users/searchByLocation/:id', (req, res) => {

  const id = req.params.id;

  let { latitude, longitude, radius } = req?.query;
  console.log('HELOO', latitude, longitude, radius);
  if (!longitude && !latitude) {
      db.all('SELECT latitude,longitude FROM users WHERE users.id == ? ', [id], (err, rows) => {
          if (err) {
              return res.status(500).send(err.message);
          }

          longitude = rows[0]?.latitude;
          latitude = rows[0]?.longitude;
      });
  }

  db.all('SELECT * FROM users where id != ?', [id], (err, rows) => {
      if (err) {
          return res.status(500).send(err.message);
      }

      const filteredUsers = rows.filter(user => {
          const distance = calculateDistance(latitude, longitude, user.latitude, user.longitude);
          console.log(distance);
          return distance <= radius;
      });

      res.status(200).json(filteredUsers);
  });
});

//Signup API with all required parameters (missing the images part)
app.post('/users/signup', (req, res) => {
  
  if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
      const form = new multiparty.Form();
      form.parse(req, (err, fields, files) => {
          if (err) {
              return res.status(400).send('Error parsing form data');
          }

          const { name, contact, education, gender, bio, dob, interests, latitude, longitude } = fields;
          let Modinterests = JSON.stringify(interests.split(','));
          let convertedDate = convertToDateTime(dob);

          db.run('INSERT INTO users (name,contact,education,gender,bio,dob,interests,latitude,longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [name, contact, education, gender, bio, convertedDate, Modinterests, latitude, longitude], function (err) {
              if (err) {
                  return res.status(500).send(err.message);
              }
              res.status(201).json({
                  name: name,
                  contact, contact,
                  education: education,
                  gender: gender,
                  bio: bio,
                  dob: convertedDate,
                  interests: JSON.parse(Modinterests),
                  latitude: latitude,
                  longitude: longitude,
              });
          });
      });
  }
  else{
      const { name, contact, education, gender, bio, dob, interests, latitude, longitude } = req.body;
      let Modinterests = JSON.stringify(interests.split(','));
      let convertedDate = convertToDateTime(dob);

      db.run('INSERT INTO users (name,contact,education,gender,bio,dob,interests,latitude,longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [name, contact, education, gender, bio, convertedDate, Modinterests, latitude, longitude], function (err) {
          if (err) {
              return res.status(500).send(err.message);
          }
          res.status(201).json({
              name: name,
              contact, contact,
              education: education,
              gender: gender,
              bio: bio,
              dob: convertedDate,
              interests: JSON.parse(Modinterests),
              latitude: latitude,
              longitude: longitude,
          });
      });

  }

});
//Signup API with all required parameters (missing the images part)
app.post('/users/signup', (req, res) => {
  
  if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
      const form = new multiparty.Form();
      form.parse(req, (err, fields, files) => {
          if (err) {
              return res.status(400).send('Error parsing form data');
          }

          const { name, contact, education, gender, bio, dob, interests, latitude, longitude } = fields;
          let Modinterests = JSON.stringify(interests.split(','));
          let convertedDate = convertToDateTime(dob);

          db.run('INSERT INTO users (name,contact,education,gender,bio,dob,interests,latitude,longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [name, contact, education, gender, bio, convertedDate, Modinterests, latitude, longitude], function (err) {
              if (err) {
                  return res.status(500).send(err.message);
              }
              res.status(201).json({
                  name: name,
                  contact, contact,
                  education: education,
                  gender: gender,
                  bio: bio,
                  dob: convertedDate,
                  interests: JSON.parse(Modinterests),
                  latitude: latitude,
                  longitude: longitude,
              });
          });
      });
  }
  else{
      const { name, contact, education, gender, bio, dob, interests, latitude, longitude } = req.body;
      let Modinterests = JSON.stringify(interests.split(','));
      let convertedDate = convertToDateTime(dob);

      db.run('INSERT INTO users (name,contact,education,gender,bio,dob,interests,latitude,longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [name, contact, education, gender, bio, convertedDate, Modinterests, latitude, longitude], function (err) {
          if (err) {
              return res.status(500).send(err.message);
          }
          res.status(201).json({
              name: name,
              contact, contact,
              education: education,
              gender: gender,
              bio: bio,
              dob: convertedDate,
              interests: JSON.parse(Modinterests),
              latitude: latitude,
              longitude: longitude,
          });
      });

  }

});
//Signup API with all required parameters (missing the images part)
app.post('/users/signup', (req, res) => {
  
  if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
      const form = new multiparty.Form();
      form.parse(req, (err, fields, files) => {
          if (err) {
              return res.status(400).send('Error parsing form data');
          }

          const { name, contact, education, gender, bio, dob, interests, latitude, longitude } = fields;
          let Modinterests = JSON.stringify(interests.split(','));
          let convertedDate = convertToDateTime(dob);

          db.run('INSERT INTO users (name,contact,education,gender,bio,dob,interests,latitude,longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [name, contact, education, gender, bio, convertedDate, Modinterests, latitude, longitude], function (err) {
              if (err) {
                  return res.status(500).send(err.message);
              }
              res.status(201).json({
                  name: name,
                  contact, contact,
                  education: education,
                  gender: gender,
                  bio: bio,
                  dob: convertedDate,
                  interests: JSON.parse(Modinterests),
                  latitude: latitude,
                  longitude: longitude,
              });
          });
      });
  }
  else{
      const { name, contact, education, gender, bio, dob, interests, latitude, longitude } = req.body;
      let Modinterests = JSON.stringify(interests.split(','));
      let convertedDate = convertToDateTime(dob);

      db.run('INSERT INTO users (name,contact,education,gender,bio,dob,interests,latitude,longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [name, contact, education, gender, bio, convertedDate, Modinterests, latitude, longitude], function (err) {
          if (err) {
              return res.status(500).send(err.message);
          }
          res.status(201).json({
              name: name,
              contact, contact,
              education: education,
              gender: gender,
              bio: bio,
              dob: convertedDate,
              interests: JSON.parse(Modinterests),
              latitude: latitude,
              longitude: longitude,
          });
      });

  }

});


app.put('/users/editUser/:id', (req, res) => {
  const userId = req.params.id;
  const { name, dob, bio, contact, gender, education } = req.body;
  const imageUrl = req.file ? req.file.path : null; // Handle image if provided

  // Validate the user ID
  if (!userId) {
    return res.status(400).send('User ID is required');
  }

  // Collect the fields to update
  let updates = [];
  let queryParams = [];
  if (name) {
    updates.push('name = ?');
    queryParams.push(name);
  }
  if (dob) {
    updates.push('dob = ?');
    queryParams.push(dob);
  }
  if (bio) {
    updates.push('bio = ?');
    queryParams.push(bio);
  }
  if (contact) {
    updates.push('contact = ?');
    queryParams.push(contact);
  }
  if (gender) {
    updates.push('gender = ?');
    queryParams.push(gender);
  }
  if (education) {
    updates.push('education = ?');
    queryParams.push(education);
  }
  if (imageUrl) {
    updates.push('imageUrl = ?');
    queryParams.push(imageUrl);
  }

  // If there are no fields to update, return an error
  if (updates.length === 0) {
    return res.status(400).send('No fields to update');
  }

  // Construct the SQL query
  const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
  queryParams.push(userId);

  // Execute the query
  db.run(query, queryParams, function (err) {
    if (err) {
      return res.status(500).send(err.message);
    }
    // Check if any rows were affected
    if (this.changes === 0) {
      return res.status(404).send('User not found');
    }
    res.status(200).send('User updated successfully');
  });
});
